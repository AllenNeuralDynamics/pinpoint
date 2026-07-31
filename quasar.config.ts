// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from "#q-app";
import pkg from "./package.json";

export default defineConfig(ctx => {
  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ["i18n.boot", "babylon-runtime.service.boot"],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ["app.sass"],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v7',
      // 'fontawesome-v7',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      "roboto-font", // optional, you are not bound to it
      "material-icons", // optional, you are not bound to it
      "material-symbols-outlined"
    ],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      // target: {
      //   browser: "es2024",
      //   node: "node24"
      // },

      typescript: {
        strict: true,
        vueShim: true
        // extendTsConfig (tsConfig) {}
      },

      // https://v2.quasar.dev/quasar-cli-vite/page-routing-with-vue-router#filename-based-routing
      // filenameBasedRouting: true,

      vueRouterMode: "hash", // available values: 'hash', 'history'
      // vueRouterBase,
      // vueDevtools,

      publicPath: "/pinpoint-v/",
      // define: {},
      defineEnv: {
        APP_VERSION: pkg.version
      },
      // ignorePublicFolder: true,
      // minify: false,
      // distDir

      // extendViteConf(userConfig) {},
      // viteVuePluginOptions: {},

      vitePlugins: [
        [
          "@intlify/unplugin-vue-i18n/vite",
          {
            // if you want to use Vue I18n Legacy API, you need to set `compositionOnly: false`
            // compositionOnly: false,

            // if you want to use named tokens in your Vue I18n messages, such as 'Hello {name}',
            // you need to set `runtimeOnly: false`
            // runtimeOnly: false,

            ssr: ctx.modeName === "ssr",

            // you need to set i18n resource including paths !
            include: [ctx.appPaths.resolve.app("src/i18n")]
          }
        ]
      ]
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      // https: true,
      open: false // opens browser window automatically
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {
        dark: "auto",
        notify: {
          position: "top-right"
        }
      },
      cssAddon: true,

      // iconSet: 'material-icons', // Quasar icon set
      // lang: 'en-US', // Quasar language pack

      // For special cases outside of where the auto-import strategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: ["Notify", "Dialog"]
    },

    // animations: 'all', // --- includes all animations
    // https://v2.quasar.dev/options/animations
    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#sourcefiles
    // sourceFiles: {
    //   rootComponent: 'src/App.vue',
    //   router: 'src/router/index',
    //   store: 'src/store/index',
    //   pwaRegisterServiceWorker: 'src-pwa/register-sw',
    //   pwaServiceWorker: 'src-pwa/sw/custom-sw',
    //   pwaManifestFile: 'src-pwa/manifest.json',
    //   electronMain: 'src-electron/electron-main',
    //   electronPreload: 'src-electron/electron-preload'
    //   bexManifestFile: 'src-bex/manifest.json
    // },

    // https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
    ssr: {
      prodPort: 3000, // The default port that the production server should use
      // (gets superseded if process.env.PORT is specified at runtime)

      middlewares: [
        "render" // keep this as last one
      ],

      // extendSSRPackageJson (pkgJson) {},
      // extendSSRWebserverConf (rolldownConf) {},

      // manualStoreSerialization: true,
      // manualStoreSsrContextInjection: true,
      // manualStoreHydration: true,
      // manualPostHydrationTrigger: true,

      pwa: false
      // pwaOfflineHtmlFilename: 'offline.html', // do NOT use index.html as name!

      // extendSSRGenerateSWOptions (cfg) {},
      // extendSSRInjectManifestOptions (cfg) {}
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: "GenerateSW" // 'GenerateSW' or 'InjectManifest'
      // swFilename: 'sw.js',
      // manifestFilename: 'manifest.json',
      // extendPWAManifestJson (json) {},
      // useCredentialsForManifestTag: true,
      // injectPWAMetaTags: false,
      // extendPWACustomSWConf (rolldownConf) {},
      // extendPWAGenerateSWOptions (cfg) {},
      // extendPWAInjectManifestOptions (cfg) {},
      // extendPWASwTsConfig (tsConfig) {}
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
    cordova: {},

    // https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: true
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron
    electron: {
      // extendElectronMainConf (rolldownConf) {},
      // extendElectronPreloadConf (rolldownConf) {},
      // extendElectronPackageJson (pkgJson) {},

      // Electron preload scripts (if any) from /src-electron, WITHOUT file extension
      preloadScripts: ["electron-preload"],

      // specify the debugging port to use for the Electron app when running in development mode
      inspectPort: 5858,

      bundler: "packager", // 'packager' or 'builder'

      packager: {
        // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
        // OS X / Mac App Store
        // appBundleId: '',
        // appCategoryType: '',
        // osxSign: '',
        // protocol: 'myapp://path',
        // Windows only
        // win32metadata: { ... }
      },

      builder: {
        // https://www.electron.build/configuration

        appId: "pinpoint-v"
      }
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
      // extendBexScriptsConf (rolldownConf) {},
      // extendBexManifestJson (json) {},

      /**
       * The list of extra scripts (js/ts) not in your bex manifest that you want to
       * compile and use in your browser extension. Maybe dynamic use them?
       *
       * Each entry in the list should be a relative filename to /src-bex/
       *
       * @example [ 'my-script.ts', 'sub-folder/my-other-script.js' ]
       */
      extraScripts: []
    }
  };
});
