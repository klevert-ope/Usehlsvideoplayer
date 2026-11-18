#!/usr/bin/env bash
set -euo pipefail

package=$1
if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -qx 'install ok installed'; then
  exit 0
fi

sources="$RUNNER_TEMP/media.sources"
sed -E 's@https?://[^ ]*ec2\.archive\.ubuntu\.com/ubuntu/?@https://archive.ubuntu.com/ubuntu/@g' \
  /etc/apt/sources.list.d/ubuntu.sources > "$sources"
apt_options=(-o Dir::Etc::sourcelist="$sources" -o Dir::Etc::sourceparts=-
             -o Acquire::Retries=2 -o Acquire::http::Timeout=10 -o Acquire::https::Timeout=10)
sudo apt-get "${apt_options[@]}" -o APT::Update::Error-Mode=any update
sudo apt-get "${apt_options[@]}" install -y --no-install-recommends "$package"
