import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Pinpoint V Documentation",
  description: "Documentation, guides, and design notes for Pinpoint V",
  base: "/v5/docs/",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Docs", link: "/" },
      { text: "Launch", link: "https://pinpoint.allenneuraldynamics.org/v5/" }
    ],

    sidebar: [
      {
        text: "Docs",
        items: [
          { text: "User Guide", link: "/user-guide" },
          { text: "Developer Guide", link: "/development" },
          { text: "Design", link: "/design" }
        ]
      }
    ],

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/AllenNeuralDynamics/pinpoint"
      }
    ]
  }
});
