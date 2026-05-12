#!/usr/bin/env bash
# genoloom-upload.sh — Self-contained Nextflow run bundler for GenoLoom Flow.
#
# Packages a local Nextflow run directory into a .tar.gz import bundle and
# optionally uploads it directly to a remote GenoLoom imports directory via SCP.

set -euo pipefail

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: genoloom-upload.sh --run-dir PATH [OPTIONS]

Required:
  --run-dir PATH        Path to the Nextflow run directory

Optional:
  --name NAME           Bundle name stem (default: basename(run-dir)_<UTC timestamp>)
  --out-dir PATH        Local output directory for the archive (default: current directory)
  --host HOST           Remote GenoLoom host for SCP upload
  --user USER           SSH/SCP user for remote upload (default: genoloom-upload)
  --remote-dir PATH     Remote imports directory (default: /srv/genoloom/runs/imports)
  --no-work             Exclude work/ or work_dir/ from the bundle
  -h, --help            Show this help

Bundle layout:
  <name>/
    dag.dot             (required)
    trace.txt           (if present)
    report.html         (if present)
    timeline.html       (if present)
    .nextflow.log       (if present)
    work_dir/           (if present and --no-work not set)

  If the run directory contains work_dir/, it is bundled as work_dir/.
  If it contains only work/, that is bundled as work_dir/ for GenoLoom compatibility.

SCP upload (when --host is supplied):
  The archive is uploaded as FILENAME.partial, then renamed to FILENAME on the
  remote host. This prevents GenoLoom from scanning an incomplete upload.
  After upload, use Upload > Scan imports folder in the GenoLoom web UI.

Examples:
  genoloom-upload.sh --run-dir /data/runs/myrun
  genoloom-upload.sh --run-dir /data/runs/myrun --host genoloom.example.com
  genoloom-upload.sh --run-dir /data/runs/myrun --no-work \\
      --host genoloom.example.com --user myuser \\
      --remote-dir /srv/genoloom/runs/imports
EOF
}

# ── Defaults ──────────────────────────────────────────────────────────────────
RUN_DIR=""
BUNDLE_NAME=""
OUT_DIR="$PWD"
HOST=""
REMOTE_USER="genoloom-upload"
REMOTE_DIR="/srv/genoloom/runs/imports"
NO_WORK=0

# ── Argument parsing ──────────────────────────────────────────────────────────
if [[ $# -eq 0 ]]; then
  usage
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-dir)    RUN_DIR="$2";      shift 2 ;;
    --name)       BUNDLE_NAME="$2";  shift 2 ;;
    --out-dir)    OUT_DIR="$2";      shift 2 ;;
    --host)       HOST="$2";         shift 2 ;;
    --user)       REMOTE_USER="$2";  shift 2 ;;
    --remote-dir) REMOTE_DIR="$2";   shift 2 ;;
    --no-work)    NO_WORK=1;         shift   ;;
    -h|--help)    usage; exit 0      ;;
    *)
      echo "Error: unknown option: $1" >&2
      echo "Run with --help for usage." >&2
      exit 1 ;;
  esac
done

# ── Validate --run-dir ────────────────────────────────────────────────────────
if [[ -z "$RUN_DIR" ]]; then
  echo "Error: --run-dir is required." >&2
  echo "Run with --help for usage." >&2
  exit 1
fi

RUN_DIR="${RUN_DIR%/}"

if [[ ! -d "$RUN_DIR" ]]; then
  echo "Error: run directory not found: $RUN_DIR" >&2
  exit 1
fi

if [[ ! -f "$RUN_DIR/dag.dot" ]]; then
  echo "" >&2
  echo "Error: dag.dot not found in run directory." >&2
  echo "  Looked in: $RUN_DIR" >&2
  echo "  To generate: add -with-dag dag.dot to your nextflow run command." >&2
  echo "" >&2
  exit 1
fi

# ── Derive and sanitize bundle name ──────────────────────────────────────────
if [[ -z "$BUNDLE_NAME" ]]; then
  BASE="$(basename "$RUN_DIR")"
  TS="$(date -u '+%Y%m%dT%H%M%SZ')"
  BUNDLE_NAME="${BASE}_${TS}"
fi
# Replace spaces and slashes with underscores
BUNDLE_NAME="${BUNDLE_NAME//[[:space:]]/_}"
BUNDLE_NAME="${BUNDLE_NAME//\//_}"

OUT_DIR="${OUT_DIR%/}"
ARCHIVE_FILENAME="${BUNDLE_NAME}.tar.gz"
ARCHIVE_PATH="${OUT_DIR}/${ARCHIVE_FILENAME}"

# ── Staging area with cleanup trap ────────────────────────────────────────────
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

STAGE="$STAGING/$BUNDLE_NAME"
mkdir -p "$STAGE"

# ── Collect artefacts ─────────────────────────────────────────────────────────
INCLUDED=()
MISSING=()

cp "$RUN_DIR/dag.dot" "$STAGE/dag.dot"
INCLUDED+=("dag.dot")

for f in trace.txt report.html timeline.html .nextflow.log; do
  if [[ -f "$RUN_DIR/$f" ]]; then
    cp "$RUN_DIR/$f" "$STAGE/$f"
    INCLUDED+=("$f")
  else
    MISSING+=("$f")
    echo "Warning: $f not found in run directory — skipping" >&2
  fi
done

# ── Work directory ────────────────────────────────────────────────────────────
if [[ "$NO_WORK" -eq 0 ]]; then
  if [[ -d "$RUN_DIR/work_dir" ]]; then
    echo "Staging work_dir/ ..."
    cp -r "$RUN_DIR/work_dir" "$STAGE/work_dir"
    INCLUDED+=("work_dir/")
  elif [[ -d "$RUN_DIR/work" ]]; then
    echo "Staging work/ -> work_dir/ ..."
    cp -r "$RUN_DIR/work" "$STAGE/work_dir"
    INCLUDED+=("work_dir/ (from work/)")
  else
    MISSING+=("work_dir/")
    echo "Warning: neither work/ nor work_dir/ found — task log inspection will be unavailable" >&2
  fi
else
  echo "Note: --no-work set — work directory excluded"
fi

# ── Create archive ────────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"
tar -czf "$ARCHIVE_PATH" -C "$STAGING" "$BUNDLE_NAME"
ARCHIVE_SIZE="$(du -sh "$ARCHIVE_PATH" 2>/dev/null | cut -f1)"

# ── Print summary ─────────────────────────────────────────────────────────────
echo ""
echo "── Bundle summary ──────────────────────────────────────────"
echo "  Archive : $ARCHIVE_PATH (${ARCHIVE_SIZE:-?})"
echo "  Included: $(IFS=', '; echo "${INCLUDED[*]}")"
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "  Missing : $(IFS=', '; echo "${MISSING[*]}")"
fi

# ── Optional SCP upload ───────────────────────────────────────────────────────
if [[ -n "$HOST" ]]; then
  REMOTE_PARTIAL="${REMOTE_DIR}/${ARCHIVE_FILENAME}.partial"
  REMOTE_FINAL="${REMOTE_DIR}/${ARCHIVE_FILENAME}"
  echo ""
  echo "Uploading to ${REMOTE_USER}@${HOST}:${REMOTE_FINAL} ..."
  scp "$ARCHIVE_PATH" "${REMOTE_USER}@${HOST}:${REMOTE_PARTIAL}"
  ssh "${REMOTE_USER}@${HOST}" "mv '${REMOTE_PARTIAL}' '${REMOTE_FINAL}'"
  echo "  Remote  : ${REMOTE_USER}@${HOST}:${REMOTE_FINAL}"
  echo ""
  echo "In GenoLoom: Upload > Scan imports folder"
else
  echo ""
  echo "No --host supplied — bundle ready for manual upload."
  echo "  To upload:"
  echo "    scp '$ARCHIVE_PATH' USER@HOST:/srv/genoloom/runs/imports/"
  echo "  Then in GenoLoom: Upload > Scan imports folder"
fi

echo "────────────────────────────────────────────────────────────"
