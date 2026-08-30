import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      "src/Layout.jsx",
      "src/utils/lane1.js",
      "src/utils/lane2.js",
      "src/utils/assembly.js",
    ],
    ignores: ["src/lib/**/*", "src/components/ui/**/*"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
    },
  },
  // Lane boundary guard (Work Package G): Lane 1 (Base44-native generation
  // + FFmpeg assembly — Quick Create/Campaign Studio/Demo Video Maker)
  // must never reach a paid Replicate/ElevenLabs generation endpoint —
  // that's Lane 2 (Movie Maker Pro) only. See lane1.js's header comment.
  //
  // AMENDED: QuickCreate.jsx is deliberately no longer in this list.
  //
  // Quick Create's "Short Video" step produced an FFmpeg Ken Burns slideshow
  // over still images — which is what this guard was protecting, and which
  // users reasonably read as the video feature being broken. It may now reach
  // Lane 2's generateSceneVideo, gated on subscription tier, and falls back to
  // the slideshow (clearly labelled as such) for everyone else.
  //
  // The guard's real purpose — don't let free users burn paid credits — is
  // now enforced where it actually binds: base44/functions/submitVideo,
  // submitMusic, submitDubVideo and submitDubAudio each return 403 for an
  // unentitled subscription. That check is what matters; this lint rule only
  // ever governed which files could *import* the call, and a lint rule cannot
  // stop a direct HTTP request. CampaignStudio and lane1.js stay guarded.
  {
    files: [
      "src/utils/lane1.js",
      "src/pages/CampaignStudio.jsx",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@/utils/lane2",
            message: "Lane 1 must not import Lane 2 (paid Replicate/ElevenLabs generation). Use @/utils/lane1 or @/utils/assembly instead.",
          },
          // Both specifier forms are restricted: pages import aiClient.js
          // via the "@/utils/aiClient" alias, but lane1.js itself (also
          // guarded, so it can't route around its own boundary) imports it
          // relatively as "./aiClient.js".
          {
            name: "@/utils/aiClient",
            importNames: [
              "submitVideo", "getVideoStatus", "generateSceneVideo",
              "submitMusic", "getMusicStatus", "generateMusic",
              "submitDubAudio", "submitDubVideo", "getDubStatus", "dubAudioFile", "dubVideoFile",
            ],
            message: "This is a paid Replicate/ElevenLabs generation call — Lane 2 only. Import it from @/utils/lane2 in a Lane 2 file instead.",
          },
          {
            name: "./aiClient.js",
            importNames: [
              "submitVideo", "getVideoStatus", "generateSceneVideo",
              "submitMusic", "getMusicStatus", "generateMusic",
              "submitDubAudio", "submitDubVideo", "getDubStatus", "dubAudioFile", "dubVideoFile",
            ],
            message: "This is a paid Replicate/ElevenLabs generation call — Lane 2 only. Add it to lane2.js instead.",
          },
        ],
      }],
    },
  },
  // Symmetric guard: Lane 2 routes through lane2.js/assembly.js, not
  // lane1.js directly.
  {
    files: ["src/utils/lane2.js", "src/pages/MovieMaker.jsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@/utils/lane1",
            message: "Lane 2 must not import Lane 1's module directly — use @/utils/lane2 or @/utils/assembly.",
          },
        ],
      }],
    },
  },
];
