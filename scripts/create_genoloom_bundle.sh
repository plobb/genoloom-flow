#!/usr/bin/env bash
# create_genoloom_bundle.sh
# Package a Nextflow run directory into a GenoLoom Flow import bundle.
#
# Usage:
#   ./scripts/create_genoloom_bundle.sh [OPTIONS] <run_name>
#
# Options:
#   -d, --dir <path>       Directory containing dag.dot and other artefacts
#                          Defaults to current directory
#   -o, --output <path>    Output .tar.gz path
#                          Defaults to <run_name>.tar.gz in current directory
#   -w, --work <path>      Path to the Nextflow work/ directory to include
#                          Defaults to <dir>/work or <dir>/work_dir if present
#   --no-work              Exclude work directory even if present
#   -h, --help             Show this help
#
# Examples:
#   ./scripts/create_genoloom_bundle.sh my_rnaseq_run
#   ./scripts/create_genoloom_bundle.sh -d /data/pipeline_output my_run
#   ./scripts/create_genoloom_bundle.sh --no-work -d /data/pipeline_output my_run

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
SOURCE_DIR="."
OUTPUT_PATH=""
WORK_PATH=""
INCLUDE_WORK=true
RUN_NAME=""

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dir)
      SOURCE_DIR="$2"; shift 2 ;;
    -o|--output)
      OUTPUT_PATH="$2"; shift 2 ;;
    -w|--work)
      WORK_PATH="$2"; shift 2 ;;
    --no-work)
      INCLUDE_WORK=false; shift ;;
    -h|--help)
      sed -n '2,/^set /p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0 ;;
    -*)
      echo "Unknown option: $1" >&2; exit 1 ;;
    *)
      RUN_NAME="$1"; shift ;;
  esac
done

if [[ -z "$RUN_NAME" ]]; then
  echo "Error: run_name is required." >&2
  echo "Usage: $0 [OPTIONS] <run_name>" >&2
  exit 1
fi

SOURCE_DIR="${SOURCE_DIR%/}"
OUTPUT_PATH="${OUTPUT_PATH:-${RUN_NAME}.tar.gz}"

# ── Validate source ───────────────────────────────────────────────────────────
if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Error: directory not found: $SOURCE_DIR" >&2
  exit 1
fi

DAG_PATH="$SOURCE_DIR/dag.dot"
if [[ ! -f "$DAG_PATH" ]]; then
  echo "Error: dag.dot not found in $SOURCE_DIR" >&2
  echo "Make sure to run Nextflow with -with-dag dag.dot" >&2
  exit 1
fi

# ── Collect files to bundle ───────────────────────────────────────────────────
FILES=()
FILES+=("dag.dot")

if [[ -f "$SOURCE_DIR/trace.txt" ]]; then
  FILES+=("trace.txt")
  echo "Including: trace.txt"
else
  echo "Warning: trace.txt not found. Task-level analysis will be unavailable."
fi

if [[ -f "$SOURCE_DIR/report.html" ]]; then
  FILES+=("report.html")
  echo "Including: report.html"
fi

if [[ -f "$SOURCE_DIR/timeline.html" ]]; then
  FILES+=("timeline.html")
  echo "Including: timeline.html"
fi

# ── Resolve work directory ────────────────────────────────────────────────────
WORK_INCLUDED=false
if [[ "$INCLUDE_WORK" == true ]]; then
  if [[ -n "$WORK_PATH" ]]; then
    if [[ ! -d "$WORK_PATH" ]]; then
      echo "Error: specified work directory not found: $WORK_PATH" >&2
      exit 1
    fi
    WORK_INCLUDED=true
  elif [[ -d "$SOURCE_DIR/work_dir" ]]; then
    WORK_PATH="$SOURCE_DIR/work_dir"
    WORK_INCLUDED=true
  elif [[ -d "$SOURCE_DIR/work" ]]; then
    WORK_PATH="$SOURCE_DIR/work"
    WORK_INCLUDED=true
  else
    echo "Note: no work/ or work_dir/ found. Task file inspection will be unavailable."
    echo "      Use -w <path> to specify a work directory or --no-work to suppress this message."
  fi
fi

# ── Estimate size ─────────────────────────────────────────────────────────────
TOTAL_KB=0
for f in "${FILES[@]}"; do
  if [[ -f "$SOURCE_DIR/$f" ]]; then
    size=$(du -k "$SOURCE_DIR/$f" 2>/dev/null | cut -f1)
    TOTAL_KB=$((TOTAL_KB + size))
  fi
done
if [[ "$WORK_INCLUDED" == true ]]; then
  work_size=$(du -sk "$WORK_PATH" 2>/dev/null | cut -f1)
  TOTAL_KB=$((TOTAL_KB + work_size))
fi

if (( TOTAL_KB > 1048576 )); then
  echo "Warning: estimated uncompressed size is $((TOTAL_KB / 1024)) MB."
  echo "         Large bundles may take several minutes to import."
fi

# ── Build the archive ─────────────────────────────────────────────────────────
TMPDIR_BUNDLE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_BUNDLE"' EXIT

BUNDLE_STAGE="$TMPDIR_BUNDLE/$RUN_NAME"
mkdir -p "$BUNDLE_STAGE"

for f in "${FILES[@]}"; do
  cp "$SOURCE_DIR/$f" "$BUNDLE_STAGE/"
done

if [[ "$WORK_INCLUDED" == true ]]; then
  WORK_DEST_NAME="work_dir"
  echo "Including: work directory -> work_dir/ ($(du -sh "$WORK_PATH" 2>/dev/null | cut -f1))"
  cp -r "$WORK_PATH" "$BUNDLE_STAGE/$WORK_DEST_NAME"
fi

echo ""
echo "Creating bundle: $OUTPUT_PATH"
tar -czf "$OUTPUT_PATH" -C "$TMPDIR_BUNDLE" "$RUN_NAME"

BUNDLE_SIZE=$(du -sh "$OUTPUT_PATH" 2>/dev/null | cut -f1)
echo "Done. Bundle size: $BUNDLE_SIZE"
echo ""
echo "Import into GenoLoom Flow:"
echo "  Upload > Import run archive (.tar.gz)"
