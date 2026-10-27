#!/bin/sh
# Registers the .icon mime type and the desktop entry (design 030 E4); harmless when the tools are missing.
command -v update-mime-database >/dev/null 2>&1 && update-mime-database /usr/share/mime || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
exit 0
