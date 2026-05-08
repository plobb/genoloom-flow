#!/usr/bin/env bash
# create_genoloom_bundle.sh
# Package a Nextflow run directory into a GenoLoom Flow import bundle.
#
# Usage:
#   ./scripts/create_genoloom_bundle.sh --run-dir PATH --name NAME [OPTIONS]
#
# Required:
#   --run-dir PATH       Directory containing dag.dot and run artefacts
#   --name NAME          Bundle name (used as the archive filename stem)
#
# Optional:
#   --out-dir PATH       Directory to write the .tar.gz  (default: current directory)
#   --imports-dir PATH   Atomically copy the finished archive here so a running
#                        GenoLoom instance can pick it up without seeing a partial file
#   --no-work            Exclude work directory even if present
#   --help               Show this help
#
# Collected artefacts (when present):
#   dag.dot              REQUIRED
#   trace.txt            Strongly recommended — enables task status and failure grouping
#   report.html          Optional
#   timeline.html        Optional
#   .nextflow.log        Optional
#   work/ or work_dir/   Optional — normalised to work_dir/ inside the archive
#
# Examples:
#   ./scripts/create_genoloom_bundle.sh \
#       --run-dir /cluster/results/rnaseq_run \
#       --name rnaseq_2024_01 \
#       --out-dir /scratch/bundles
#
#   ./scripts/create_genoloom_bundle.sh \
#       --run-dir /data/pipeline_output \
#       --name failed_gatk_run \
#       --out-dir /tmp \
#       --imports-dir /srv/genoloom/runs/imports

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
RUN_DIR=""
OUT_DIR="."
NAME=""
IMPORTS_DIR=""
INCLUDE_WORK=true

# ── Argument parsing ──────────────────────────────────────────────────────────
if [[ $# -eq 0 ]]; then
  sed -n '/^# Usage/,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \?//'
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-dir)
      RUN_DIR="$2"; shift 2 ;;
    --out-dir)
      OUT_DIR="$2"; shift 2 ;;
    --name)
      NAME="$2"; shift 2 ;;
    --imports-dir)
      IMPORTS_DIR="$2"; shift 2 ;;
    --no-work)
      INCLUDE_WORK=false; shift ;;
    --help|-h)
      sed -n '/^# Usage/,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "Error: unknown option: $1" >&2
      echo "Run with --help for usage." >&2
      exit 1 ;;
  esac
done

# ── Validate required arguments ───────────────────────────────────────────────
if [[ -z "$RUN_DIR" ]]; then
  echo "Error: --run-dir is required." >&2
  echo "Run with --help for usage." >&2
  exit 1
fi

if [[ -z "$NAME" ]]; then
  echo "Error: --name is required." >&2
  echo "Run with --help for usage." >&2
  exit 1
fi

if [[ "$NAME" =~ [/[:space:]] ]]; then
  echo "Error: --name must not contain spaces or slashes: '$NAME'" >&2
  exit 1
fi

RUN_DIR="${RUN_DIR%/}"
OUT_DIR="${OUT_DIR%/}"

if [[ ! -d "$RUN_DIR" ]]; then
  echo "Error: --run-dir not found: $RUN_DIR" >&2
  exit 1
fi

mkdir -p "$OUT_DIR" || {
  echo "Error: cannot create --out-dir: $OUT_DIR" >&2
  exit 1
}

ARCHIVE_NAME="${NAME}.tar.gz"
ARCHIVE_PATH="${OUT_DIR}/${ARCHIVE_NAME}"

# ── Validate dag.dot (required) ───────────────────────────────────────────────
if [[ ! -f "$RUN_DIR/dag.dot" ]]; then
  echo "" >&2
  echo "Error: dag.dot not found." >&2
  echo "  Looked in: $RUN_DIR" >&2
  echo "  dag.dot is required to visualise the pipeline graph." >&2
  echo "  To generate: add -with-dag dag.dot to your nextflow run command." >&2
  echo "" >&2
  exit 1
fi

# ── Collect artefacts ─────────────────────────────────────────────────────────
INCLUDED=()
MISSING_OPTIONAL=()

INCLUDED+=("dag.dot")

# trace.txt — strongly recommended
if [[ -f "$RUN_DIR/trace.txt" ]]; then
  INCLUDED+=("trace.txt")
else
  MISSING_OPTIONAL+=("trace.txt")
  echo ""
  echo "Warning: trace.txt not found — task-level analysis will be limited."
  echo "  - Task status will be unavailable"
  echo "  - Failure grouping will be unavailable"
  echo "  - Stderr/task drilldown will be limited"
  echo "  To enable: rerun with -with-trace trace.txt"
  echo ""
fi

# Optional HTML artefacts
for fname in report.html timeline.html; do
  if [[ -f "$RUN_DIR/$fname" ]]; then
    INCLUDED+=("$fname")
  else
    MISSING_OPTIONAL+=("$fname")
  fi
done

# .nextflow.log
if [[ -f "$RUN_DIR/.nextflow.log" ]]; then
  INCLUDED+=(".nextflow.log")
else
  MISSING_OPTIONAL+=(".nextflow.log")
fi

# ── Resolve work directory ────────────────────────────────────────────────────
WORK_SRC=""
WORK_INCLUDED=false

if [[ "$INCLUDE_WORK" == true ]]; then
  if [[ -d "$RUN_DIR/work_dir" ]]; then
    WORK_SRC="$RUN_DIR/work_dir"
    WORK_INCLUDED=true
  elif [[ -d "$RUN_DIR/work" ]]; then
    WORK_SRC="$RUN_DIR/work"
    WORK_INCLUDED=true
  else
    MISSING_OPTIONAL+=("work_dir/")
  fi
fi

# ── Estimate size and warn if large ──────────────────────────────────────────
TOTAL_KB=0
for f in "${INCLUDED[@]}"; do
  if [[ -f "$RUN_DIR/$f" ]]; then
    fsize=$(du -k "$RUN_DIR/$f" 2>/dev/null | cut -f1)
    TOTAL_KB=$((TOTAL_KB + ${fsize:-0}))
  fi
done
if [[ "$WORK_INCLUDED" == true ]]; then
  wsize=$(du -sk "$WORK_SRC" 2>/dev/null | cut -f1)
  TOTAL_KB=$((TOTAL_KB + ${wsize:-0}))
fi
if (( TOTAL_KB > 1048576 )); then
  echo "Note: estimated uncompressed size is $((TOTAL_KB / 1024)) MB — compression may take a few minutes."
fi

# ── Stage files into a temp directory ────────────────────────────────────────
TMPDIR_BUNDLE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_BUNDLE"' EXIT

STAGE="$TMPDIR_BUNDLE/$NAME"
mkdir -p "$STAGE"

for f in "${INCLUDED[@]}"; do
  cp "$RUN_DIR/$f" "$STAGE/"
done

if [[ "$WORK_INCLUDED" == true ]]; then
  work_display_size=$(du -sh "$WORK_SRC" 2>/dev/null | cut -f1)
  echo "Staging work directory -> work_dir/ (${work_display_size:-?})"
  cp -r "$WORK_SRC" "$STAGE/work_dir"
  INCLUDED+=("work_dir/")
fi

# ── Create archive ────────────────────────────────────────────────────────────
tar -czf "$ARCHIVE_PATH" -C "$TMPDIR_BUNDLE" "$NAME"
ARCHIVE_SIZE=$(du -sh "$ARCHIVE_PATH" 2>/dev/null | cut -f1)

# ── Atomic copy to imports dir ────────────────────────────────────────────────
IMPORTS_DEST=""
if [[ -n "$IMPORTS_DIR" ]]; then
  mkdir -p "$IMPORTS_DIR" || {
    echo "Error: cannot create --imports-dir: $IMPORTS_DIR" >&2
    exit 1
  }
  IMPORTS_DEST="${IMPORTS_DIR}/${ARCHIVE_NAME}"
  cp "$ARCHIVE_PATH" "${IMPORTS_DEST}.partial"
  mv "${IMPORTS_DEST}.partial" "$IMPORTS_DEST"
fi

# ── Operational summary ───────────────────────────────────────────────────────
INCLUDED_STR=$(printf '%s  ' "${INCLUDED[@]}")
echo ""
echo "── Bundle summary ───────────────────────────────────────"
echo "  Archive:  $ARCHIVE_PATH (${ARCHIVE_SIZE:-?})"
echo "  Included: ${INCLUDED_STR%  }"
if [[ ${#MISSING_OPTIONAL[@]} -gt 0 ]]; then
  MISSING_STR=$(printf '%s  ' "${MISSING_OPTIONAL[@]}")
  echo "  Missing:  ${MISSING_STR%  }"
fi
if [[ -n "$IMPORTS_DEST" ]]; then
  echo "  Imports:  copied to $IMPORTS_DEST"
else
  echo "  Imports:  not copied (--imports-dir not set)"
fi
echo "─────────────────────────────────────────────────────────"
echo ""
echo "To import: Upload > Import run archive (.tar.gz)"
