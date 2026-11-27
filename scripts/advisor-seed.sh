#!/bin/sh
# Seed pathological layouts for the striping advisor, sized for the lab
# cluster (512 MiB OSTs) but scale-safe on bigger filesystems.
# Run from anywhere on the Lustre client:  sh /path/to/advisor-seed.sh
set -e

M=/mnt/lustre/stripelab/advisor
mkdir -p "$M"

# hot-single-ost fires at 15% of one OST's capacity; monolith gets 30% so it
# stays above the bar yet always fits on the emptiest OST.
TOTAL_KB=$(lfs df /mnt/lustre 2>/dev/null | awk '$1 ~ /OST0000_UUID/ {gsub(",", "", $2); print $2}')
case "$TOTAL_KB" in ''|*[!0-9]*) TOTAL_KB=524288 ;; esac
MB=$(awk -v t="$TOTAL_KB" 'BEGIN { m = int(t * 0.30 / 1024); if (m > 900) m = 900; if (m < 1) m = 1; print m }')

echo "seeding wide-small/wide-tiny, monolith=${MB}M (fits one OST)"

dd if=/dev/zero of="$M/wide-small" bs=1M count=5 status=none
dd if=/dev/zero of="$M/wide-tiny" bs=1K count=200 status=none
dd if=/dev/zero of="$M/monolith" bs=1M count="$MB" status=none

# Layouts are stamped AFTER the data exists: plain `lfs migrate` without
# layout flags restripes onto the filesystem default (count=2 here),
# keeping a copy until the new layout is committed.
cd "$M"
lfs migrate wide-small
lfs migrate wide-tiny
lfs migrate monolith
sync

echo "== placement check =="
for f in wide-small wide-tiny monolith; do
  echo "-- $f"
  lfs getstripe --yaml "$f" | grep -E 'stripe_size|stripe_count|l_ost_idx'
done
