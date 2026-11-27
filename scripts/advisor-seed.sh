#!/bin/sh
# Seed pathological layouts for the striping advisor, sized for the lab
# cluster (512 MiB OSTs) but scale-safe on bigger filesystems.
# Run from anywhere on the Lustre client:  sh /path/to/advisor-seed.sh
set -e

M=/mnt/lustre/stripelab/advisor
mkdir -p "$M"

# hot-single-ost fires at 15% of one OST's capacity; monolith gets ~30% so it
# stays above the bar yet always fits on the emptiest OST.
TOTAL_KB=$(lfs df /mnt/lustre 2>/dev/null | awk '$1 ~ /OST0000_UUID/ {gsub(",", "", $2); print $2}')
case "$TOTAL_KB" in ''|*[!0-9]*) TOTAL_KB=524288 ;; esac
MB=$(awk -v t="$TOTAL_KB" 'BEGIN { m = int(t * 0.30 / 1024); if (m > 900) m = 900; if (m < 1) m = 1; print m }')

echo "seeding wide-small/wide-tiny/monolith=${MB}M"

dd if=/dev/zero of="$M/wide-small" bs=1M count=5 status=none
dd if=/dev/zero of="$M/wide-tiny" bs=1K count=200 status=none

# single-OST monolith: write inside a count=1 directory so placement is
# guaranteed without migrate.
lfs setstripe -c 1 -s 1M "$M/hotdir"
dd if=/dev/zero of="$M/hotdir/monolith" bs=1M count="$MB" status=none

# Restripe after data exists; migrate keeps a copy until the new layout lands.
cd "$M"
lfs migrate wide-small --stripe-count 8 --stripe-size 1M
lfs migrate wide-tiny --stripe-count 2 --stripe-size 1M
sync

echo "== placement check =="
lfs getstripe --yaml wide-small | grep -E 'stripe_size|stripe_count|l_ost_idx'
lfs getstripe --yaml wide-tiny | grep -E 'stripe_size|stripe_count|l_ost_idx'
lfs getstripe --yaml hotdir/monolith | grep -E 'stripe_size|stripe_count|l_ost_idx'
