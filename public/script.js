"use strict";

document.documentElement.classList.add("js");

const sectionPages = [...document.querySelectorAll("[data-section-page]")];
const sectionLinks = [...document.querySelectorAll("[data-section-link]")];
const sectionRailLinks = [...document.querySelectorAll(".section-rail [data-section-link]")];
const sectionAnnouncer = document.querySelector("[data-section-announcer]");
const edgePrevious = document.querySelector('[data-edge-switch="previous"]');
const edgeNext = document.querySelector('[data-edge-switch="next"]');
const skipLink = document.querySelector("[data-skip-link]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const sectionNames = sectionPages.map(
  (section) => section.id.charAt(0).toUpperCase() + section.id.slice(1),
);

let currentSection = 0;
let isTransitioning = false;
let transitionTimer = 0;
let edgeDirection = 0;
let edgeReady = false;
let edgeGestureTimer = 0;
let touchStartY = null;

function sectionIndexFromTarget(target) {
  return sectionPages.findIndex((section) => section.id === target);
}

function sectionIndexFromHash() {
  const target = window.location.hash.slice(1);
  const directMatch = sectionIndexFromTarget(target);

  if (directMatch >= 0) {
    return directMatch;
  }

  if (target.startsWith("project-")) {
    return sectionIndexFromTarget("projects");
  }

  return 0;
}

function activeScroller() {
  return sectionPages[currentSection]?.querySelector("[data-section-scroller]");
}

function hasNeighbor(direction) {
  const nextIndex = currentSection + direction;
  return nextIndex >= 0 && nextIndex < sectionPages.length;
}

function isAtBoundary(scroller, direction) {
  if (!scroller) {
    return false;
  }

  const epsilon = 3;

  if (direction < 0) {
    return scroller.scrollTop <= epsilon;
  }

  return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - epsilon;
}

function edgeControlForDirection(direction) {
  return direction < 0 ? edgePrevious : edgeNext;
}

function updateEdgeControls() {
  const previousIndex = currentSection - 1;
  const nextIndex = currentSection + 1;

  edgePrevious.hidden = previousIndex < 0;
  edgeNext.hidden = nextIndex >= sectionPages.length;

  if (previousIndex >= 0) {
    edgePrevious.querySelector("[data-edge-title]").textContent = sectionNames[previousIndex];
  }

  if (nextIndex < sectionPages.length) {
    edgeNext.querySelector("[data-edge-title]").textContent = sectionNames[nextIndex];
  }
}

function dismissEdge() {
  window.clearTimeout(edgeGestureTimer);
  edgeGestureTimer = 0;
  edgeDirection = 0;
  edgeReady = false;
  edgePrevious.classList.remove("is-visible");
  edgeNext.classList.remove("is-visible");
}

function revealEdge(direction, readyAfterGesture = false) {
  if (!hasNeighbor(direction)) {
    dismissEdge();
    return;
  }

  const control = edgeControlForDirection(direction);
  const otherControl = edgeControlForDirection(-direction);

  edgeDirection = direction;
  edgeReady = readyAfterGesture;
  control.classList.add("is-visible");
  otherControl.classList.remove("is-visible");
}

function armEdgeAfterWheelGesture() {
  window.clearTimeout(edgeGestureTimer);
  edgeGestureTimer = window.setTimeout(() => {
    edgeReady = true;
  }, 180);
}

function focusSectionHeading(section) {
  const heading = section.querySelector("h1, h2");

  if (heading) {
    heading.focus({ preventScroll: true });
  }
}

function setSection(
  nextIndex,
  { historyMode = "push", focusHeading = false, source = "link" } = {},
) {
  if (
    nextIndex < 0 ||
    nextIndex >= sectionPages.length ||
    (isTransitioning && nextIndex !== currentSection)
  ) {
    return;
  }

  if (nextIndex === currentSection) {
    dismissEdge();
    if (focusHeading) {
      focusSectionHeading(sectionPages[nextIndex]);
    }
    return;
  }

  const previousIndex = currentSection;
  const direction = nextIndex > previousIndex ? 1 : -1;
  const destination = sectionPages[nextIndex];
  const destinationScroller = destination.querySelector("[data-section-scroller]");
  const boundarySources = new Set(["wheel", "touch", "keyboard", "edge"]);

  dismissEdge();
  isTransitioning = true;
  window.clearTimeout(transitionTimer);

  if (boundarySources.has(source)) {
    destinationScroller.scrollTop = direction > 0 ? 0 : destinationScroller.scrollHeight;
  } else if (source === "link") {
    destinationScroller.scrollTop = 0;
  }

  currentSection = nextIndex;
  document.body.dataset.section = destination.id;

  sectionPages.forEach((section, index) => {
    const isCurrent = index === nextIndex;
    section.dataset.position = index < nextIndex ? "before" : index > nextIndex ? "after" : "current";
    section.setAttribute("aria-hidden", String(!isCurrent));
    section.inert = !isCurrent;
  });

  sectionRailLinks.forEach((link) => {
    const isCurrent = link.dataset.sectionTarget === destination.id;

    if (isCurrent) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  updateEdgeControls();

  if (historyMode === "push") {
    window.history.pushState({ section: destination.id }, "", `#${destination.id}`);
  } else if (historyMode === "replace") {
    window.history.replaceState({ section: destination.id }, "", `#${destination.id}`);
  }

  if (sectionAnnouncer) {
    sectionAnnouncer.textContent = `${sectionNames[nextIndex]} section`;
  }

  if (focusHeading) {
    const delay = reducedMotion.matches ? 0 : 360;
    window.setTimeout(() => focusSectionHeading(destination), delay);
  }

  const transitionDuration = reducedMotion.matches ? 0 : 700;
  transitionTimer = window.setTimeout(() => {
    isTransitioning = false;
  }, transitionDuration);
}

function navigateFromEdge(direction, source) {
  if (!hasNeighbor(direction)) {
    return;
  }

  setSection(currentSection + direction, {
    historyMode: "push",
    focusHeading: source === "edge" || source === "keyboard",
    source,
  });
}

function handleWheel(event) {
  if (isTransitioning || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
    return;
  }

  if (Math.abs(event.deltaY) < 2) {
    return;
  }

  const direction = event.deltaY > 0 ? 1 : -1;
  const scroller = activeScroller();

  if (!hasNeighbor(direction) || !isAtBoundary(scroller, direction)) {
    if (edgeDirection && !isAtBoundary(scroller, edgeDirection)) {
      dismissEdge();
    }
    return;
  }

  event.preventDefault();

  if (edgeDirection === direction && edgeReady) {
    navigateFromEdge(direction, "wheel");
    return;
  }

  if (edgeDirection !== direction) {
    revealEdge(direction);
  }

  armEdgeAfterWheelGesture();
}

function handleBoundaryKey(event) {
  if (event.defaultPrevented || event.repeat || isTransitioning) {
    return;
  }

  const interactiveTarget = event.target.closest(
    "button, a, input, textarea, select, [contenteditable='true']",
  );

  if (interactiveTarget) {
    return;
  }

  const keyDirections = {
    ArrowUp: -1,
    ArrowDown: 1,
    PageUp: -1,
    PageDown: 1,
  };
  const direction = keyDirections[event.key];

  if (!direction) {
    if (event.key === "Escape") {
      dismissEdge();
    }
    return;
  }

  const scroller = activeScroller();

  if (!hasNeighbor(direction) || !isAtBoundary(scroller, direction)) {
    return;
  }

  event.preventDefault();

  if (edgeDirection === direction && edgeReady) {
    navigateFromEdge(direction, "keyboard");
  } else {
    revealEdge(direction, true);
  }
}

function handleTouchStart(event) {
  if (event.touches.length !== 1 || isTransitioning) {
    touchStartY = null;
    return;
  }

  touchStartY = event.touches[0].clientY;
}

function handleTouchEnd(event) {
  if (touchStartY === null || event.changedTouches.length !== 1 || isTransitioning) {
    touchStartY = null;
    return;
  }

  const distance = touchStartY - event.changedTouches[0].clientY;
  touchStartY = null;

  if (Math.abs(distance) < 44) {
    return;
  }

  const direction = distance > 0 ? 1 : -1;
  const scroller = activeScroller();

  if (!hasNeighbor(direction) || !isAtBoundary(scroller, direction)) {
    return;
  }

  if (edgeDirection === direction && edgeReady) {
    navigateFromEdge(direction, "touch");
  } else {
    revealEdge(direction, true);
  }
}

sectionLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const nextIndex = sectionIndexFromTarget(link.dataset.sectionTarget);

    if (nextIndex < 0) {
      return;
    }

    event.preventDefault();
    setSection(nextIndex, {
      historyMode: "push",
      focusHeading: true,
      source: "link",
    });
  });
});

skipLink.addEventListener("click", (event) => {
  event.preventDefault();
  focusSectionHeading(sectionPages[currentSection]);
});

edgePrevious.addEventListener("click", () => navigateFromEdge(-1, "edge"));
edgeNext.addEventListener("click", () => navigateFromEdge(1, "edge"));

sectionPages.forEach((section) => {
  const scroller = section.querySelector("[data-section-scroller]");

  scroller.addEventListener("wheel", handleWheel, { passive: false });
  scroller.addEventListener("touchstart", handleTouchStart, { passive: true });
  scroller.addEventListener("touchend", handleTouchEnd, { passive: true });
  scroller.addEventListener("scroll", () => {
    if (edgeDirection && !isAtBoundary(scroller, edgeDirection)) {
      dismissEdge();
    }
  }, { passive: true });
});

document.addEventListener("keydown", handleBoundaryKey);

window.addEventListener("popstate", () => {
  const historySection = sectionIndexFromHash();

  setSection(historySection, {
    historyMode: "none",
    focusHeading: historySection !== currentSection,
    source: "history",
  });

  const projectFromHistory = projectNameFromHash();

  if (projectFromHistory) {
    setProject(projectFromHistory);
    setProjectView(projectViewFromHash());
  } else if (window.location.hash === "#projects") {
    setProjectView("showcase");
  }
});

const projectTabs = [...document.querySelectorAll("[data-project-tab]")];
const projectPanels = [...document.querySelectorAll("[data-project-panel]")];
const projectBuildButton = document.querySelector("[data-project-build-link]");
const projectBuildLinkLabel = document.querySelector("[data-build-link-label]");
const projectBuildLinkKicker = document.querySelector("[data-build-link-kicker]");
const projectBuildLinkIcon = document.querySelector("[data-build-link-icon]");
const projectBuildLinkArrow = document.querySelector("[data-build-link-arrow]");
const projectWorkspace = document.querySelector(".project-workspace");
const workspaceWindows = [
  ...document.querySelectorAll("[data-workspace-window]"),
];
const projectBuildPanels = [
  ...document.querySelectorAll("[data-project-build-panel]"),
];
const projectBuildReturnButton = document.querySelector(
  "[data-project-build-return]",
);
const projectBuildReturnLabel = document.querySelector("[data-build-return-label]");
const projectBuildWindowTitle = document.querySelector("[data-build-window-title]");
let projectWindowTransitionTimer = 0;

function projectNameFromHash() {
  return window.location.hash.match(/^#(project-\d+)(?:$|-)/)?.[1] ?? null;
}

function projectViewFromHash() {
  return /^#project-\d+-build$/.test(window.location.hash) ? "build" : "showcase";
}

function selectedProjectTab() {
  return projectTabs.find((tab) => tab.dataset.projectTab === document.body.dataset.project);
}

function animateProjectViewChange(mode, previousMode) {
  if (
    !projectWorkspace ||
    mode === previousMode ||
    reducedMotion.matches ||
    !document.documentElement.classList.contains("is-ready")
  ) {
    return;
  }

  window.clearTimeout(projectWindowTransitionTimer);
  projectWorkspace.classList.remove(
    "is-project-transitioning",
    "is-transitioning-to-build",
    "is-transitioning-to-showcase",
  );
  void projectWorkspace.offsetWidth;
  projectWorkspace.classList.add(
    "is-project-transitioning",
    `is-transitioning-to-${mode}`,
  );

  projectWindowTransitionTimer = window.setTimeout(() => {
    projectWorkspace.classList.remove(
      "is-project-transitioning",
      "is-transitioning-to-build",
      "is-transitioning-to-showcase",
    );
  }, 720);
}

function applyProjectViewState() {
  const activeMode = document.body.dataset.projectView;
  const activeProject = document.body.dataset.project;

  workspaceWindows.forEach((windowElement) => {
    const isCurrentWindow = windowElement.dataset.workspaceWindow === activeMode;
    windowElement.setAttribute("aria-hidden", String(!isCurrentWindow));
    windowElement.inert = !isCurrentWindow;
  });

  projectBuildPanels.forEach((panel) => {
    panel.hidden = panel.dataset.projectBuildPanel !== activeProject;
  });
}

function updateProjectViewButton() {
  const selectedTab = selectedProjectTab();

  if (!selectedTab || !projectBuildButton) {
    return;
  }

  const projectTitle = selectedTab.dataset.projectTitle;
  const hasBuild = selectedTab.dataset.hasBuild === "true";

  projectBuildButton.disabled = !hasBuild;
  projectBuildButton.setAttribute("aria-disabled", String(!hasBuild));
  projectBuildButton.setAttribute(
    "aria-label",
    hasBuild
      ? `Open the ${projectTitle} web build`
      : `${projectTitle} does not have a web build`,
  );

  if (projectBuildLinkKicker) {
    projectBuildLinkKicker.textContent = hasBuild
      ? "Web build"
      : "Web build unavailable";
  }

  if (projectBuildLinkLabel) {
    projectBuildLinkLabel.textContent = hasBuild
      ? `Open ${projectTitle} build`
      : `No build for ${projectTitle}`;
  }

  if (projectBuildLinkIcon) {
    projectBuildLinkIcon.textContent = hasBuild ? "▶" : "—";
  }

  if (projectBuildLinkArrow) {
    projectBuildLinkArrow.textContent = hasBuild ? "→" : "—";
  }

  if (projectBuildReturnLabel) {
    projectBuildReturnLabel.textContent = `Return to ${projectTitle}`;
  }

  if (projectBuildWindowTitle) {
    projectBuildWindowTitle.textContent = projectTitle;
  }

  if (projectBuildReturnButton) {
    projectBuildReturnButton.setAttribute(
      "aria-label",
      `Return to the ${projectTitle} interactive picture`,
    );
  }
}

function setProjectView(
  mode,
  { historyMode = "none", announce = false } = {},
) {
  if (mode !== "showcase" && mode !== "build") {
    return;
  }

  const previousMode = document.body.dataset.projectView;
  const selectedTab = selectedProjectTab();
  const hasBuild = selectedTab?.dataset.hasBuild === "true";

  if (mode === "build" && !hasBuild) {
    mode = "showcase";

    if (/^#project-\d+-build$/.test(window.location.hash) && selectedTab) {
      window.history.replaceState(
        {
          section: "projects",
          project: selectedTab.dataset.projectTab,
          projectView: mode,
        },
        "",
        `#${selectedTab.dataset.projectTab}`,
      );
    }
  }

  document.body.dataset.projectView = mode;
  animateProjectViewChange(mode, previousMode);
  applyProjectViewState();
  updateProjectViewButton();

  if (selectedTab && historyMode !== "none") {
    const target =
      mode === "build"
        ? selectedTab.dataset.buildTarget
        : selectedTab.dataset.projectTab;
    const state = {
      section: "projects",
      project: selectedTab.dataset.projectTab,
      projectView: mode,
    };

    window.history[`${historyMode}State`](state, "", `#${target}`);
  }

  if (announce && sectionAnnouncer && selectedTab) {
    sectionAnnouncer.textContent = `${selectedTab.dataset.projectTitle} ${
      mode === "build" ? "web build" : "interactive picture"
    } view`;
  }
}

function setProject(projectName, focusTab = false) {
  const selectedTab = projectTabs.find((tab) => tab.dataset.projectTab === projectName);

  if (!selectedTab) {
    return;
  }

  document.body.dataset.project = projectName;

  projectTabs.forEach((tab) => {
    const isSelected = tab === selectedTab;
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  });

  projectPanels.forEach((panel) => {
    panel.hidden = panel.dataset.projectPanel !== projectName;
  });

  applyProjectViewState();
  updateProjectViewButton();

  if (focusTab) {
    selectedTab.focus();
  }
}

projectTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    setProject(tab.dataset.projectTab);
    setProjectView("showcase", { historyMode: "push", announce: true });
  });
  tab.addEventListener("keydown", (event) => {
    const supportedKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

    if (!supportedKeys.includes(event.key)) {
      return;
    }

    event.preventDefault();
    let nextIndex = index;

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + projectTabs.length) % projectTabs.length;
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % projectTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = projectTabs.length - 1;
    }

    setProject(projectTabs[nextIndex].dataset.projectTab, true);
    setProjectView("showcase", { historyMode: "replace", announce: true });
  });
});

projectBuildButton?.addEventListener("click", () => {
  if (!projectBuildButton.disabled) {
    setProjectView("build", { historyMode: "push", announce: true });
  }
});

projectBuildReturnButton?.addEventListener("click", () => {
  setProjectView("showcase", { historyMode: "push", announce: true });
  window.requestAnimationFrame(() => projectBuildButton?.focus({ preventScroll: true }));
});

const sceneHighlightDetails = {
  clouds: {
    kicker: "Inspecting the scene",
    title: "Clouds",
    copy: "The cloud group spanning the upper-right part of the frame.",
  },
  sky: {
    kicker: "Inspecting the scene",
    title: "Sky",
    copy: "The open blue area separating the clouds from the grass.",
  },
  grass: {
    kicker: "Inspecting the scene",
    title: "Grass",
    copy: "The sunlit field filling the lower-left foreground.",
  },
  ball: {
    kicker: "Inspecting the scene",
    title: "Ball",
    copy: "The white ball set against the darker grass near the right.",
  },
};

function initializeProjectGallery(gallery) {
  const slides = [...gallery.querySelectorAll("[data-gallery-slide]")];
  const thumbnails = [...gallery.querySelectorAll("[data-gallery-thumbnail]")];
  const previous = gallery.querySelector("[data-gallery-previous]");
  const next = gallery.querySelector("[data-gallery-next]");
  const currentLabel = gallery.querySelector("[data-gallery-current]");
  const totalLabel = gallery.querySelector("[data-gallery-total]");
  const scenes = slides
    .map((slide) => slide.querySelector("[data-interactive-scene]"))
    .filter(Boolean);
  const inspector = gallery
    .closest("[data-project-panel]")
    ?.querySelector("[data-scene-inspector]");
  const sceneStates = new WeakMap();
  let activeSlideIndex = 0;

  const formatIndex = (index) => String(index + 1).padStart(2, "0");
  const activeScene = () => slides[activeSlideIndex]?.querySelector("[data-interactive-scene]");

  function controlsForScene(scene) {
    return [...gallery.querySelectorAll("[data-scene-highlight]")].filter((control) => {
      const owningScene = control.closest("[data-interactive-scene]");
      return owningScene ? owningScene === scene : activeScene() === scene;
    });
  }

  function updateInspectorContent(state, contentKey, content) {
    if (state.pendingContent === contentKey) {
      return;
    }

    window.clearTimeout(state.updateTimer);
    window.clearTimeout(state.animationTimer);

    if (state.currentContent === contentKey) {
      state.pendingContent = null;
      state.content.classList.remove("is-exiting", "is-entering");
      return;
    }

    state.pendingContent = contentKey;

    const commitContent = () => {
      state.kicker.textContent = content.kicker;
      state.title.textContent = content.title;
      state.copy.textContent = content.copy;
      state.inspector.dataset.inspectorState = content.state;
      state.currentContent = contentKey;
      state.pendingContent = null;
    };

    state.content.classList.remove("is-entering");

    if (reducedMotion.matches || state.currentContent === null) {
      state.content.classList.remove("is-exiting");
      commitContent();
      return;
    }

    state.content.classList.add("is-exiting");
    state.updateTimer = window.setTimeout(() => {
      commitContent();
      state.content.classList.remove("is-exiting");
      void state.content.offsetWidth;
      state.content.classList.add("is-entering");
      state.animationTimer = window.setTimeout(() => {
        state.content.classList.remove("is-entering");
      }, 300);
    }, 90);
  }

  function showSceneOverview(scene) {
    const state = sceneStates.get(scene);

    if (!state) {
      return;
    }

    updateInspectorContent(state, "overview", {
      state: "overview",
      kicker: "Interactive picture",
      title: "Choose a target",
      copy: "Hover, focus, or click any target to show its explanation here.",
    });

    controlsForScene(scene).forEach((control) => {
      control.classList.remove("is-active");
      control.setAttribute("aria-pressed", "false");
    });
  }

  function showSceneHighlight(scene, highlightName, isPinned = false) {
    const detail = sceneHighlightDetails[highlightName];
    const state = sceneStates.get(scene);

    if (!detail || !state) {
      return;
    }

    updateInspectorContent(state, `detail-${highlightName}`, {
      state: "detail",
      kicker: detail.kicker,
      title: detail.title,
      copy: detail.copy,
    });

    controlsForScene(scene).forEach((control) => {
      const matches = control.dataset.sceneHighlight === highlightName;
      control.classList.toggle("is-active", matches);
      control.setAttribute("aria-pressed", String(isPinned && matches));
    });
  }

  function restoreScene(scene) {
    const state = sceneStates.get(scene);

    if (state?.pinnedHighlight) {
      showSceneHighlight(scene, state.pinnedHighlight, true);
    } else {
      showSceneOverview(scene);
    }
  }

  function setSlide(nextIndex) {
    if (!slides.length) {
      return;
    }

    activeSlideIndex = Math.min(Math.max(nextIndex, 0), slides.length - 1);

    slides.forEach((slide, index) => {
      slide.hidden = index !== activeSlideIndex;
    });

    thumbnails.forEach((thumbnail) => {
      const isCurrent = Number(thumbnail.dataset.galleryThumbnail) === activeSlideIndex;
      thumbnail.setAttribute("aria-pressed", String(isCurrent));
    });

    if (currentLabel) {
      currentLabel.textContent = formatIndex(activeSlideIndex);
    }

    if (previous) {
      previous.disabled = activeSlideIndex === 0;
    }

    if (next) {
      next.disabled = activeSlideIndex === slides.length - 1;
    }

    scenes.forEach(restoreScene);
  }

  scenes.forEach((scene) => {
    const state = {
      pinnedHighlight: null,
      currentContent: null,
      pendingContent: null,
      updateTimer: 0,
      animationTimer: 0,
      inspector,
      content: inspector?.querySelector("[data-scene-content]"),
      kicker: inspector?.querySelector("[data-scene-kicker]"),
      title: inspector?.querySelector("[data-scene-title]"),
      copy: inspector?.querySelector("[data-scene-copy]"),
    };

    if (
      !state.inspector ||
      !state.content ||
      !state.kicker ||
      !state.title ||
      !state.copy
    ) {
      return;
    }

    sceneStates.set(scene, state);
  });

  [...gallery.querySelectorAll("[data-scene-highlight]")].forEach((control) => {
    const controlledScene = () => control.closest("[data-interactive-scene]") || activeScene();

    control.addEventListener("pointerenter", () => {
      const scene = controlledScene();
      if (scene) {
        showSceneHighlight(scene, control.dataset.sceneHighlight);
      }
    });

    control.addEventListener("pointerleave", () => {
      const scene = controlledScene();
      if (scene && document.activeElement !== control) {
        restoreScene(scene);
      }
    });

    control.addEventListener("focus", () => {
      const scene = controlledScene();
      if (scene) {
        showSceneHighlight(scene, control.dataset.sceneHighlight);
      }
    });

    control.addEventListener("blur", () => {
      const scene = controlledScene();
      if (scene) {
        restoreScene(scene);
      }
    });

    control.addEventListener("click", () => {
      const scene = controlledScene();
      const state = scene ? sceneStates.get(scene) : null;

      if (!scene || !state) {
        return;
      }

      state.pinnedHighlight =
        state.pinnedHighlight === control.dataset.sceneHighlight
          ? null
          : control.dataset.sceneHighlight;
      restoreScene(scene);
    });

    control.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      const scene = controlledScene();
      const state = scene ? sceneStates.get(scene) : null;

      if (scene && state) {
        state.pinnedHighlight = null;
        showSceneOverview(scene);
      }
    });
  });

  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener("click", () => {
      setSlide(Number(thumbnail.dataset.galleryThumbnail));
    });
  });

  previous?.addEventListener("click", () => setSlide(activeSlideIndex - 1));
  next?.addEventListener("click", () => setSlide(activeSlideIndex + 1));

  if (totalLabel) {
    totalLabel.textContent = String(slides.length).padStart(2, "0");
  }

  gallery.classList.toggle("is-single", slides.length <= 1);
  setSlide(0);
}

document.querySelectorAll("[data-project-gallery]").forEach(initializeProjectGallery);

const initialSection = sectionIndexFromHash();
const initialProject = projectNameFromHash() ?? "project-1";

currentSection = initialSection;
sectionPages.forEach((section, index) => {
  const isCurrent = index === initialSection;
  section.dataset.position = index < initialSection ? "before" : index > initialSection ? "after" : "current";
  section.setAttribute("aria-hidden", String(!isCurrent));
  section.inert = !isCurrent;
});

sectionRailLinks.forEach((link) => {
  if (link.dataset.sectionTarget === sectionPages[initialSection].id) {
    link.setAttribute("aria-current", "page");
  } else {
    link.removeAttribute("aria-current");
  }
});

document.body.dataset.section = sectionPages[initialSection].id;
edgePrevious.hidden = false;
edgeNext.hidden = false;
updateEdgeControls();
setProject(initialProject);
setProjectView(projectViewFromHash());

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => document.documentElement.classList.add("is-ready"));
});
