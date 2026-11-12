# Hank for LG webOS TV

Run Hank on LG Smart TVs (webOS 5.0+ / 2020–2026 models: OLED C/G series, QNED, NanoCell, etc.).

## How It Works

- **App Shell (`app/`):** A native webOS web application (`com.kellogs12.hank.tv`) displayed on the TV. It initializes the TV screen, handles the LG Magic Remote and standard remote inputs (`hank-webos.js`), and connects to the background service.
- **Background Service (`service/`):** A webOS Node.js service running locally on the TV (`http://127.0.0.1:8080`). It serves Stremio Web with Hank's plugin and Netflix-inspired theme injected automatically, while bypassing browser cross-origin constraints.
- **Hardware Playback:** Video streams play directly through the TV's native hardware decoders (4K HDR10, Dolby Vision, HEVC, AV1).
- **Remote Navigation:** Full mapping for LG Magic Remote (wheel, pointer, D-pad, OK, media buttons, and Back button `keyCode 461`).

---

## Installation Methods

You can install Hank on your LG TV using **webOS Dev Manager** (recommended GUI for Mac/PC) or **LG Developer Mode**. No root is required.

### Method 1: Install with webOS Dev Manager (Easiest)

[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) is a graphical installer for Windows, macOS, and Linux.

1. **Install the Developer Mode app on your TV:**
   - On your LG TV, open the **LG Content Store** (or "Apps").
   - Search for **Developer Mode** and install it.
   - Open Developer Mode, log in with your free LG account (or create one at [webostv.developer.lge.com](https://webostv.developer.lge.com/)), and turn **Dev Mode Status** to **ON**. The TV will prompt you to restart.
   - After restarting, open Developer Mode again and turn **Key Server** to **ON**. Note down your TV's **IP Address** and **Passphrase**.

2. **Connect via webOS Dev Manager:**
   - Download and open **webOS Dev Manager** on your computer.
   - Click **Add Device**, enter the TV's IP address, choose **Developer Mode**, and type the Passphrase shown on your TV screen.
   - Click **Connect**.

3. **Install the Package:**
   - In webOS Dev Manager, click **Install** (or drag and drop).
   - Select `com.kellogs12.hank.tv_2.35.1_all.ipk` (located in the `webos/` folder).
   - Once installation completes, **Hank** appears directly on your TV launcher ribbon!

---

### Method 2: Install via Command Line (`ares-cli` / `@webos-tools/cli`)

1. Install the official webOS CLI on your computer:
   ```sh
   npm install -g @webos-tools/cli
   ```
2. Set up your TV device (needs Developer Mode active on the TV with Key Server enabled):
   ```sh
   ares-setup-device
   ```
   Follow the prompts to add your TV (e.g. device name `myTV`, port `9922`, user `prisoner`).
3. Fetch the developer key:
   ```sh
   ares-novacom --device myTV --getkey
   ```
4. Install Hank:
   ```sh
   ares-install --device myTV webos/com.kellogs12.hank.tv_2.35.1_all.ipk
   ```
5. Launch Hank:
   ```sh
   ares-launch --device myTV com.kellogs12.hank.tv
   ```

---

### Method 3: Install via Homebrew Channel (Rooted TVs)

If your LG TV is rooted with the [webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel):

1. Open **webOS Dev Manager** or use `ares-install`.
2. Install `com.kellogs12.hank.tv_2.35.1_all.ipk`.
3. Rooted TVs never expire the 1000-hour Developer Mode session timer.

---

## Building the Package

To regenerate the `.ipk` package after modifying the plugin, theme, or webOS bridge:

```sh
node tools/package-webos.mjs
```

The output file is written to `webos/com.kellogs12.hank.tv_2.35.1_all.ipk`.
