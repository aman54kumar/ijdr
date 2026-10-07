#!/usr/bin/env bash
# Shrink a journal PDF with Ghostscript before uploading.
# Usage: scripts/compress-pdf.sh input.pdf [output.pdf] [ebook|screen|printer]
#   ebook   (default) ~150 dpi images, good for reading on screen
#   screen  ~72 dpi, smallest
#   printer ~300 dpi, larger
set -euo pipefail

in="${1:?usage: $0 input.pdf [output.pdf] [ebook|screen|printer]}"
out="${2:-${in%.pdf}-compressed.pdf}"
preset="${3:-ebook}"

command -v gs >/dev/null || { echo "Ghostscript (gs) is required" >&2; exit 1; }

gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -dPDFSETTINGS="/$preset" \
   -dNOPAUSE -dQUIET -dBATCH -sOutputFile="$out" "$in"

before=$(stat -c %s "$in"); after=$(stat -c %s "$out")
printf 'Before: %.1f MB\nAfter:  %.1f MB\n' "$(echo "$before/1048576" | bc -l)" "$(echo "$after/1048576" | bc -l)"
