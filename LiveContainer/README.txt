# Hank LiveContainer Shortcuts

This folder contains multiple ways to launch the Hank (dx.pi) iPhone app directly inside LiveContainer:

1. `Hank (Signed).shortcut` or `Hank (Dxbi) (Signed).shortcut`:
   - Tap this file on your iPhone (in Files or AirDrop).
   - Apple Shortcuts will prompt "Add Shortcut".
   - You can then add it directly to your Home Screen with 1 tap.

2. `Hank-HomeScreen.mobileconfig` (Home Screen WebClip):
   - Tap this profile in Files on your iPhone.
   - Go to iPhone Settings -> Profile Downloaded -> Install.
   - This puts a native "Hank" icon directly onto your iOS Home Screen with the Hank logo!
   - Tapping the icon immediately opens LiveContainer and boots Hank.

3. `Launch-Hank.html`:
   - An HTML launcher bookmark you can open in Safari and tap Share -> "Add to Home Screen".

4. `Hank.url`:
   - An internet shortcut targeting `livecontainer://livecontainer-launch?bundle-name=Hank.app` (or `Dxbi.app` if using earlier test IPAs).

5. `Hank-Icon.png`:
   - High-resolution 1024x1024 Hank app icon for custom shortcut icons.
