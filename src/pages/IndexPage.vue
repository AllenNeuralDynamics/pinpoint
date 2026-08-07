<script setup lang="ts">
import { onMounted, onUnmounted, ref, type Ref } from "vue";
import { onKeyStroke } from "@vueuse/core";
import {
  pruneSceneObjectModels,
  SceneCanvas,
  SceneHierarchy
} from "@/features/scene";
import { type TouchPanValue, useQuasar } from "quasar";
import {
  ExperimentPropertiesDialog,
  NewExperimentDialog,
  RecentExperimentsDialog,
  useExperimentFile
} from "@/features/experiment";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";
import { AtlasHierarchy } from "@/features/atlas";
import { ProbeLibraryDialog } from "@/features/probe";
import { openPreferencesDialog } from "@/features/preferences";
import { Inspector } from "@/features/inspector";
import { SplashDialog } from "@/features/splash";
import { clamp } from "@/utils/math";
import { ChannelMaps } from "@/features/slice";

/** Widest a drawer can be resized to, as a fraction of the window width. */
const MAXIMUM_DRAWER_WIDTH_RATIO = 0.4;
const BASE_URL = import.meta.env.BASE_URL;
/** Is the platform macOS, where shortcut hints use symbol glyphs instead of word labels. */
const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

const $q = useQuasar();
const currentExperimentStore = useCurrentExperimentStore();
const recentExperimentsStore = useRecentExperimentsStore();
const { openExperiment, downloadExperiment } = useExperimentFile();

const leftDrawerOpen = ref(false);
const rightDrawerOpen = ref(false);
const leftDrawerWidth = ref(350);
const rightDrawerWidth = ref(350);
const tab = ref("channel-maps");

/**
 * Toggle a drawer's open state.
 * @param drawerOpen Drawer open-state ref to toggle.
 */
function toggleDrawer(drawerOpen: Ref<boolean>) {
  drawerOpen.value = !drawerOpen.value;
}

/**
 * Build a touch-pan handler that resizes a drawer, clamped to a maximum
 * fraction of the window width.
 * @param drawerWidth Drawer width ref to resize.
 * @param sign +1 to grow with a rightward drag, -1 to grow with a leftward one.
 */
function makeResizeDrawer(
  drawerWidth: Ref<number>,
  sign: 1 | -1
): TouchPanValue {
  return function (details) {
    const delta = sign * (details.delta?.x ?? 0);
    drawerWidth.value = clamp(
      drawerWidth.value + delta,
      0,
      window.innerWidth * MAXIMUM_DRAWER_WIDTH_RATIO
    );
  };
}

function toggleLeftDrawer() {
  toggleDrawer(leftDrawerOpen);
}

function toggleRightDrawer() {
  toggleDrawer(rightDrawerOpen);
}

const resizeLeftDrawer = makeResizeDrawer(leftDrawerWidth, 1);
const resizeRightDrawer = makeResizeDrawer(rightDrawerWidth, -1);

/**
 * Force minHeight and height of QPage to be the same.
 * @param offset Height offset caused by the header and footer.
 */
function fixedQPageHeight(offset: number) {
  const height = offset ? `calc(100vh - ${offset}px)` : "100vh";

  return {
    minHeight: height,
    height
  };
}

/**
 * Is a keyboard event's target an editable element, where the browser's own
 * undo/redo should take priority over the app's.
 * @param target Event target to check.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA")
  );
}

// Ctrl/Cmd+Z undoes the current experiment, unless an editable element is
// focused, in which case the browser's native text-field undo takes over.
onKeyStroke(
  event =>
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    event.code === "KeyZ",
  event => {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    currentExperimentStore.undo();
  }
);

// Ctrl/Cmd+Shift+Z redoes the current experiment, same editable-target guard.
onKeyStroke(
  event =>
    (event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyZ",
  event => {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    currentExperimentStore.redo();
  }
);

onMounted(() => {
  // Show splash.
  // $q.dialog({ component: SplashDialog });
});

// Reclaim models no experiment references any more. Fire-and-forget: a hard tab
// close can cut the IndexedDB transaction short, and the sweep is idempotent, so
// the next teardown finishes the job.
onUnmounted(() => {
  const referencedIds = [
    currentExperimentStore.experiment,
    ...recentExperimentsStore.recents
  ].flatMap(experiment => experiment.sceneObjects.map(({ id }) => id));
  void pruneSceneObjectModels(referencedIds);
});
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn dense flat round icon="menu" @click="toggleLeftDrawer" />

        <q-toolbar-title shrink>{{
          currentExperimentStore.name
        }}</q-toolbar-title>

        <q-btn flat :label="$t('layout.file')">
          <q-menu auto-close>
            <q-list>
              <q-item
                clickable
                @click="$q.dialog({ component: NewExperimentDialog })"
              >
                <q-item-section>{{ $t("layout.new") }}</q-item-section>
              </q-item>
              <q-item clickable @click="() => openExperiment()">
                <q-item-section>{{ $t("layout.open") }}</q-item-section>
              </q-item>
              <q-item
                clickable
                @click="$q.dialog({ component: RecentExperimentsDialog })"
              >
                <q-item-section>{{ $t("layout.openRecent") }}</q-item-section>
              </q-item>
              <q-item clickable @click="() => void downloadExperiment()">
                <q-item-section>{{ $t("layout.download") }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>

        <q-btn flat :label="$t('layout.edit')">
          <q-menu auto-close>
            <q-list>
              <q-item
                clickable
                :disable="!currentExperimentStore.canUndo"
                @click="currentExperimentStore.undo()"
              >
                <q-item-section>{{ $t("layout.undo") }}</q-item-section>
                <q-item-section side class="shortcut-hint">
                  <template v-if="isMac"><kbd>⌘</kbd><kbd>Z</kbd></template>
                  <template v-else>
                    <kbd>{{ $t("layout.ctrlKey") }}</kbd
                    >+<kbd>Z</kbd>
                  </template>
                </q-item-section>
              </q-item>
              <q-item
                clickable
                :disable="!currentExperimentStore.canRedo"
                @click="currentExperimentStore.redo()"
              >
                <q-item-section>{{ $t("layout.redo") }}</q-item-section>
                <q-item-section side class="shortcut-hint">
                  <template v-if="isMac">
                    <kbd>⌘</kbd><kbd>⇧</kbd><kbd>Z</kbd>
                  </template>
                  <template v-else>
                    <kbd>{{ $t("layout.ctrlKey") }}</kbd
                    >+<kbd>{{ $t("layout.shiftKey") }}</kbd
                    >+<kbd>Z</kbd>
                  </template>
                </q-item-section>
              </q-item>
              <q-separator />
              <q-item
                clickable
                @click="$q.dialog({ component: ExperimentPropertiesDialog })"
              >
                <q-item-section>{{
                  $t("layout.experimentProperties")
                }}</q-item-section>
              </q-item>
              <q-item
                clickable
                @click="$q.dialog({ component: ProbeLibraryDialog })"
              >
                <q-item-section>{{ $t("layout.probeLibrary") }}</q-item-section>
              </q-item>
              <q-item clickable @click="$q.dark.toggle">
                <q-item-section>{{
                  $t("layout.toggleDarkMode")
                }}</q-item-section>
              </q-item>
              <q-item clickable @click="openPreferencesDialog($q)">
                <q-item-section>{{ $t("layout.preferences") }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>

        <q-btn :label="$t('layout.help')" flat :href="`${BASE_URL}docs`" />

        <q-space />

        <q-btn dense flat round icon="menu" @click="toggleRightDrawer" />
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="leftDrawerOpen"
      :width="leftDrawerWidth"
      bordered
      show-if-above
      side="left"
      no-swipe-close
      no-swipe-open
    >
      <div class="column full-height">
        <q-tabs v-model="tab">
          <q-tab name="scene" :label="$t('layout.scene')" />
          <q-tab name="channel-maps" :label="$t('layout.channelMaps')" />
          <q-tab name="atlas" :label="$t('layout.atlas')" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="tab" animated class="col">
          <q-tab-panel name="scene" class="scene-panel">
            <SceneHierarchy />
          </q-tab-panel>
          <q-tab-panel name="channel-maps">
            <ChannelMaps />
          </q-tab-panel>
          <q-tab-panel name="atlas">
            <AtlasHierarchy />
          </q-tab-panel>
        </q-tab-panels>
      </div>
      <div
        v-touch-pan.horizontal.prevent.mouse="resizeLeftDrawer"
        class="q-drawer__resizer q-drawer__resizer--left"
      ></div>
    </q-drawer>

    <q-drawer
      v-model="rightDrawerOpen"
      :width="rightDrawerWidth"
      bordered
      show-if-above
      side="right"
      no-swipe-close
      no-swipe-open
    >
      <Inspector />
      <div
        v-touch-pan.horizontal.prevent.mouse="resizeRightDrawer"
        class="q-drawer__resizer q-drawer__resizer--right"
      ></div>
    </q-drawer>

    <q-page-container>
      <q-page :style-fn="fixedQPageHeight">
        <SceneCanvas />
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style lang="sass" scoped>
.q-drawer__resizer
  position: absolute
  top: 0
  bottom: 0
  width: 3px
  background-color: $grey-5
  cursor: ew-resize

  &:after
    content: ''
    position: absolute
    top: 50%
    height: 10%
    left: -2px
    right: -2px
    transform: translateY(-50%)
    background-color: inherit
    border-radius: 4px

body.body--dark .q-drawer__resizer
  background-color: $grey-8

.q-drawer__resizer--left
  right: -1.5px

.q-drawer__resizer--right
  left: -1.5px

.q-tab-panel
  height: 100%
  overflow: hidden

.q-tab-panel.scene-panel
  overflow-y: auto

.column
  flex-wrap: nowrap

.shortcut-hint
  flex-direction: row
  align-items: center
  gap: 2px

kbd
  font-family: inherit
  font-size: 0.75rem
  line-height: 1
  padding: 2px 5px
  border-radius: 3px
  border: 1px solid $grey-5
  background-color: $grey-2
  color: inherit

body.body--dark kbd
  border-color: $grey-8
  background-color: $grey-9
</style>
