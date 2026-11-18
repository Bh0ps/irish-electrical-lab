# Irish Electrical Lab on iPhone

Use Safari on iOS 17 or later. The 3D bench uses WebGL 2. If graphics are unavailable, you can still operate equipment, connect wires and take readings through the equipment list. Open the lab, tap **Share**, and choose **Add to Home Screen**. If Safari shows **Open as Web App**, leave it enabled. Tap **Add** and open the new icon. The same lab also works directly in Safari. [Apple’s Home Screen instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)

In the Home Screen app, open **More → Download for offline use**. Keep the app open with a connection until it shows **Offline ready**. The download includes both circuit workers and the simplified 3D equipment for every course and Sandbox. Inspecting equipment loads its full model on demand when available. The offline download can resume after a failed file or a connection interruption.

Safari, the Home Screen app, and Windows keep separate study data. On Windows, choose **My builds → Export full backup** and transfer the JSON file to the iPhone’s Files app, for example with iCloud Drive. Open the lab from your Home Screen, then choose **My builds → Restore backup** and pick the file. To export from iPhone, choose **Export full backup**, then **Save to Files** if the share sheet opens. Keep a backup of study data you want to retain. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)

Tap controls to operate them. Drag to orbit, pinch to zoom and drag with two fingers to pan. To move a part in Sandbox, select it, tap **Move**, then drag its housing. **Connect** and **Measure** accept taps on the workbench and let you search for terminals by name. Tap a wire to see **Remove conductor**, or find it by name under **View**. Use **Undo** to restore the last edit.

Open **Start learning** for the first light-switch lesson. **Continue learning** brings you back to the saved activity. **Chapters** lists every lesson, Quick practice and the chapter practicals. In an experiment you can predict the outcome or choose **I’m not sure** and try the real control.

**Equipment list** gives you the same controls and terminals by name. Use it when a part is hard to tap or the 3D view cannot start. **Connect → Cable** shows the shapes and cores of the three cable choices. In a meter exercise, pick the red and black probe points, then choose **Record reading**. A full backup includes your current coursebook position as well as the working circuit.

## Build and publish

From `lab/`, after installing the locked dependencies:

```powershell
npm run web:build
npm run web:audit
npm run web:preview
```

Preview at `http://127.0.0.1:4174/irish-electrical-lab/` on the build computer. Localhost is allowed to register a service worker; an iPhone needs the HTTPS deployment URL. The web build writes `lab/dist-web`, with its own iOS 17 build target and repository path. The Windows production build still writes `lab/dist/client` and uses its existing localhost storage origin.

The public repository’s Pages settings must use **GitHub Actions** as the publishing source. Run **Publish iPhone web app** from the default branch after verification. The workflow publishes only `lab/dist-web` under the repository path. The generated service worker verifies the built files by size and SHA-256 and replaces an earlier offline copy only after the required files are available. [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
