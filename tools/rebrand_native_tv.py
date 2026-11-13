#!/usr/bin/env python3
import os
import sys
import re
import shutil

def patch_manifest(decoded_dir):
    manifest_path = os.path.join(decoded_dir, "AndroidManifest.xml")
    if not os.path.isfile(manifest_path):
        print(f"Error: Manifest not found at {manifest_path}")
        return False

    with open(manifest_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Change package name
    content = content.replace('package="com.stremio.one"', 'package="com.kellogs12.hank.tv"')

    # Update custom permissions to match new package
    content = content.replace(
        'android:name="com.stremio.one.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"',
        'android:name="com.kellogs12.hank.tv.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"'
    )

    # Update ContentProvider authorities so they don't collide with official Stremio
    content = content.replace(
        'android:authorities="com.stremio.one.content"',
        'android:authorities="com.kellogs12.hank.tv.content"'
    )
    content = content.replace(
        'android:authorities="com.stremio.one.firebaseinitprovider"',
        'android:authorities="com.kellogs12.hank.tv.firebaseinitprovider"'
    )
    content = content.replace(
        'android:authorities="com.stremio.one.androidx-startup"',
        'android:authorities="com.kellogs12.hank.tv.androidx-startup"'
    )

    # Change app label to Hank
    content = re.sub(r'android:label="@[^"]+"', 'android:label="Hank"', content)

    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write(content)

    print("Patched AndroidManifest.xml successfully.")
    return True

def patch_strings(decoded_dir):
    res_dir = os.path.join(decoded_dir, "res")
    if not os.path.isdir(res_dir):
        return

    count = 0
    for root, _, files in os.walk(res_dir):
        for file in files:
            if file == "strings.xml":
                p = os.path.join(root, file)
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    s = f.read()

                # Change app name and brand safely within XML string tags
                s = re.sub(r'(<string\b[^>]*>)(.*?)(</string>)', lambda m: m.group(1) + m.group(2).replace('Stremio', 'Hank') + m.group(3), s)

                with open(p, "w", encoding="utf-8") as f:
                    f.write(s)
                count += 1

    print(f"Patched strings in {count} strings.xml files.")

def patch_colors(decoded_dir):
    res_dir = os.path.join(decoded_dir, "res")
    if not os.path.isdir(res_dir):
        return

    count = 0
    for root, _, files in os.walk(res_dir):
        for file in files:
            if file == "colors.xml":
                p = os.path.join(root, file)
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    s = f.read()

                # Replace common Stremio purple accents with Hank red (#E50914)
                s = re.sub(r'#ff72408c', '#ffe50914', s, flags=re.IGNORECASE)
                s = re.sub(r'#72408c', '#e50914', s, flags=re.IGNORECASE)
                s = re.sub(r'#ff3b123b', '#ff141414', s, flags=re.IGNORECASE)
                s = re.sub(r'#3b123b', '#141414', s, flags=re.IGNORECASE)

                with open(p, "w", encoding="utf-8") as f:
                    f.write(s)
                count += 1

    print(f"Patched colors in {count} colors.xml files.")

def patch_assets(decoded_dir, banner_src, icon_src):
    res_dir = os.path.join(decoded_dir, "res")
    if not os.path.isdir(res_dir):
        return

    banner_count = 0
    icon_count = 0

    for root, _, files in os.walk(res_dir):
        for file in files:
            p = os.path.join(root, file)
            # Match TV launcher banners (Leanback)
            if "banner" in file.lower() and file.endswith(".png"):
                shutil.copyfile(banner_src, p)
                banner_count += 1
            # Match app launcher icons
            elif "launcher" in file.lower() and file.endswith(".png"):
                shutil.copyfile(icon_src, p)
                icon_count += 1

    print(f"Replaced {banner_count} banner assets and {icon_count} launcher icon assets.")

def main():
    if len(sys.argv) < 4:
        print("Usage: rebrand_native_tv.py <decoded_dir> <banner_png> <icon_png>")
        sys.exit(1)

    decoded_dir = sys.argv[1]
    banner_src = sys.argv[2]
    icon_src = sys.argv[3]

    if not os.path.isdir(decoded_dir):
        print(f"Error: directory {decoded_dir} does not exist")
        sys.exit(1)

    patch_manifest(decoded_dir)
    patch_strings(decoded_dir)
    patch_colors(decoded_dir)
    patch_assets(decoded_dir, banner_src, icon_src)
    print("Rebranding complete.")

if __name__ == "__main__":
    main()
