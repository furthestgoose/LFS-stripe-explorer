#!/bin/sh
# Seed pathological layouts for the striping advisor.
# Run from any directory on the Lustre client:  sh advisor-seed.sh
set -e

M=/mnt/lustre/stripelab/advisor
mkdir -p "$M"
dd if=/dev/zero of="$M/wide-small" bs=1M count=5 status=none
dd if=/dev/zero of="$M/wide-tiny" bs=1K count=200 status=none
dd if=/dev/zero of="$M/monolith" bs=1M count=9216 status=none

# Layouts are stamped AFTER the data exists: plain `lfs migrate` without
# layout flags restripes onto the filesystem default (count=2 here),
# keeping a copy until the new layout is committed.
cd "$M"
lfs migrate monolith
lfs migrate wide-small
lfs migrate wide-tiny
sync

echo "== placement check =="
for f in wide-small wide-tiny monolith; do
  echo "-- $f"
  lfs getstripe --yaml "$f" | grep -E 'stripe_size|stripe_count|l_ost_idx'
done
