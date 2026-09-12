# StreamSports99 — Android app (Android 6.0+ / Android TV)

A ~1 MB WebView wrapper around the StreamSports99 site. Works on:

- **Android TV / Google TV** (leanback launcher banner, D-pad navigation, no touchscreen needed)
- Fire TV sticks (sideload)
- Phones & tablets (Android 6.0 "Marshmallow" / API 23 — covering 6.0.1, the last 6.x release — and everything newer)

## What it does

| Behaviour | Detail |
|---|---|
| Startup | Loads the deployed site (`REMOTE_URL` in `MainActivity.java`) when online; **falls back to the copy bundled in `assets/www`** when offline — instant start on TV boxes |
| Fullscreen video | HTML5 fullscreen handled via `WebChromeClient.onShowCustomView` |
| Autoplay | Enabled (`setMediaPlaybackRequiresUserGesture(false)`) |
| Mixed content | Allowed in compatibility mode — many free sports streams are plain `http://` |
| D-pad | Arrows/ENTER reach the page, which runs its own spatial-navigation engine; BACK exits fullscreen → history → app; MENU reloads |
| Crashes | `onRenderProcessGone` restarts the app instead of dying on low-memory boxes |

## Project layout

```
android/
  settings.gradle, build.gradle, gradle.properties
  app/
    build.gradle                       minSdk 23, targetSdk 34, no dependencies
    src/main/
      AndroidManifest.xml              LAUNCHER + LEANBACK_LAUNCHER, TV banner
      java/com/streamsports99/app/
        MainActivity.java              WebView host (plain Activity, no AndroidX)
      assets/www/                      ← bundled copy of the site (synced by script)
      res/
        mipmap-*/ic_launcher.png       launcher icons (48–192 px)
        drawable/tv_banner.png         320×180 Android TV banner
        values/{strings,themes}.xml
```

## Build

### Option A — GitHub Actions (no local tools needed)

The build workflow is provided as [`android/ci-workflow-reference.yml`](ci-workflow-reference.yml)
(bot tokens aren't allowed to write to `.github/workflows/`, so it ships as a
reference). **Activate it once:**

1. Open the file `android/ci-workflow-reference.yml` in this repo, copy its full contents
2. On GitHub: **Add file → Create new file** → name it `.github/workflows/android-build.yml` → paste → commit to `main`
   (or locally: `mkdir -p .github/workflows && cp android/ci-workflow-reference.yml .github/workflows/android-build.yml && git add .github && git commit -m "ci: android apk" && git push`)

Then, after every push to `main` (or a manual run via **Actions → Android APK → Run workflow**):

1. Open the repo → **Actions** → **Android APK** → latest run
2. Download the **streamsports99-debug-apk** artifact — it's debug-signed and installs anywhere "unknown sources" is allowed

To get a release-signed APK automatically, add repository **secrets**:
`ANDROID_KEYSTORE_BASE64` (base64 of your keystore), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`.

### Option B — Android Studio

1. Android Studio → **Open** → select the `android/` folder
2. Let it sync (it will offer to generate a Gradle wrapper — accept), pick an SDK 34+ toolchain
3. **Build → Build Bundle(s)/APK(s) → Build APK(s)**

### Option C — Command line

```bash
# needs JDK 17 + Gradle 8.7+ and Android SDK 34 (ANDROID_HOME set)
gradle -p android assembleDebug      # -> android/app/build/outputs/apk/debug/app-debug.apk
gradle -p android assembleRelease    # unsigned release

# sign a release build with your own keystore:
gradle -p android assembleRelease \
  -PksFile=/path/to/release.keystore -PksPass=YOURPASS -PksAlias=YOURALIAS

# then align + sign if you did not use the signing config:
zipalign  -p -f 4 app-release-unsigned.apk app-release.apk
apksigner sign --ks /path/to/release.keystore --out app-release.apk app-release.apk
```

## Install on a TV

```bash
adb connect <TV_IP>:5555
adb install -r app-debug.apk
```

Or sideload: copy the APK to a USB stick / download with the TV's file manager (e.g. **File Commander** / **Send Files to TV**) and open it. Enable *Settings → Device → Security → Unknown sources* first. The app appears in the TV's **Apps row** with its green banner.

## Keeping the bundled site fresh

After editing the site (`index.html`, `css/`, `js/`):

```bash
./scripts/sync_android_assets.sh   # re-copies the site into assets/www
```

Icons/banner can be regenerated with `python3 scripts/make_icons.py` (stdlib only).

## Changing where the app points

Edit `REMOTE_URL` in `app/src/main/java/com/streamsports99/app/MainActivity.java`
(default `https://heiken-sports.vercel.app/`), and update the same host in
`SiteWebViewClient.shouldOverrideUrlLoading` if you move to a custom domain.
