"use strict";

document.documentElement.classList.add("js");

const sectionPages = [...document.querySelectorAll("[data-section-page]")];
const sectionLinks = [...document.querySelectorAll("[data-section-link]")];
const sectionRailLinks = [
  ...document.querySelectorAll(".section-rail [data-section-link]"),
];
const sectionDeck = document.querySelector(".section-deck");
const sectionAnnouncer = document.querySelector("[data-section-announcer]");
const skipLink = document.querySelector("[data-skip-link]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const buildAccessDisabled = window.matchMedia(
  "(max-width: 42rem), (hover: none) and (pointer: coarse)",
);
const hoverPointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const deferredProjectImages = [
  ...document.querySelectorAll("[data-deferred-src]"),
];

const sectionNames = sectionPages.map(
  (section) => section.id.charAt(0).toUpperCase() + section.id.slice(1),
);

let currentSection = 0;
let isTransitioning = false;
let transitionTimer = 0;
let transitionFocusTarget = null;
let pendingSectionRequest = null;
let touchStartY = null;

function addMediaQueryChangeListener(query, listener) {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
  } else {
    query.addListener(listener);
  }
}

function loadDeferredProjectImages() {
  deferredProjectImages.forEach((image) => {
    const source = image.dataset.deferredSrc;

    if (!source) {
      return;
    }

    if (image.dataset.deferredAlt) {
      image.alt = image.dataset.deferredAlt;
      image.removeAttribute("data-deferred-alt");
    }

    if (image.dataset.deferredPriority) {
      image.fetchPriority = image.dataset.deferredPriority;
      image.removeAttribute("data-deferred-priority");
    }

    image.src = source;
    image.removeAttribute("data-deferred-src");
  });
}

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

  return (
    scroller.scrollTop + scroller.clientHeight >=
    scroller.scrollHeight - epsilon
  );
}

function scrollerCanScroll(scroller) {
  if (!scroller) {
    return false;
  }

  const overflowY = window.getComputedStyle(scroller).overflowY;

  return (
    (overflowY === "auto" || overflowY === "scroll") &&
    scroller.scrollHeight > scroller.clientHeight + 3
  );
}

function focusSectionHeading(section) {
  const heading = section.querySelector("h1, h2");

  if (heading) {
    heading.focus({ preventScroll: true });
  }
}

function finishSectionTransition() {
  if (!isTransitioning) {
    return;
  }

  window.clearTimeout(transitionTimer);
  isTransitioning = false;
  sectionDeck?.classList.remove("is-section-transitioning");
  sectionPages.forEach((section) => {
    section.classList.remove("is-section-bypassed");
  });

  if (transitionFocusTarget) {
    focusSectionHeading(transitionFocusTarget);
    transitionFocusTarget = null;
  }

  const queuedRequest = pendingSectionRequest;
  pendingSectionRequest = null;

  if (queuedRequest && queuedRequest.nextIndex !== currentSection) {
    window.requestAnimationFrame(() => {
      setSection(queuedRequest.nextIndex, queuedRequest.options);
    });
  }
}

function setSection(
  nextIndex,
  { historyMode = "push", focusHeading = false, source = "link" } = {},
) {
  if (nextIndex < 0 || nextIndex >= sectionPages.length) {
    return;
  }

  if (isTransitioning && nextIndex !== currentSection) {
    pendingSectionRequest = {
      nextIndex,
      options: { historyMode, focusHeading, source },
    };
    transitionFocusTarget = null;
    return;
  }

  if (sectionPages[nextIndex]?.id === "projects") {
    loadDeferredProjectImages();
  }

  if (nextIndex === currentSection) {
    if (focusHeading) {
      focusSectionHeading(sectionPages[nextIndex]);
    }
    return;
  }

  if (
    sectionPages[currentSection]?.id === "projects" &&
    sectionPages[nextIndex]?.id !== "projects"
  ) {
    setProjectView("showcase");
  }

  const previousIndex = currentSection;
  const direction = nextIndex > previousIndex ? 1 : -1;
  const destination = sectionPages[nextIndex];
  const destinationScroller = destination.querySelector("[data-section-scroller]");
  const boundarySources = new Set(["wheel", "touch", "keyboard"]);
  const isSkippingSection = Math.abs(nextIndex - previousIndex) > 1;

  isTransitioning = true;
  transitionFocusTarget = focusHeading ? destination : null;
  sectionDeck?.classList.add("is-section-transitioning");
  window.clearTimeout(transitionTimer);

  sectionPages.forEach((section) => {
    section.classList.remove("is-section-bypassed");
  });

  if (isSkippingSection) {
    sectionPages.forEach((section, index) => {
      if (index !== previousIndex && index !== nextIndex) {
        section.classList.add("is-section-bypassed");
      }
    });
  }

  if (boundarySources.has(source)) {
    destinationScroller.scrollTop = direction > 0 ? 0 : destinationScroller.scrollHeight;
  } else if (source === "link") {
    destinationScroller.scrollTop = 0;
  }

  currentSection = nextIndex;
  document.body.dataset.section = destination.id;

  if (sectionDeck) {
    sectionDeck.scrollTop = 0;
    sectionDeck.scrollLeft = 0;
  }

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

  if (historyMode === "push") {
    window.history.pushState({ section: destination.id }, "", `#${destination.id}`);
  } else if (historyMode === "replace") {
    window.history.replaceState({ section: destination.id }, "", `#${destination.id}`);
  }

  if (sectionAnnouncer) {
    sectionAnnouncer.textContent = `${sectionNames[nextIndex]} section`;
  }

  if (!document.documentElement.classList.contains("is-ready")) {
    window.requestAnimationFrame(finishSectionTransition);
  } else {
    transitionTimer = window.setTimeout(finishSectionTransition, 760);
  }
}

sectionDeck?.addEventListener("transitionend", (event) => {
  if (
    isTransitioning &&
    event.propertyName.endsWith("transform") &&
    event.target instanceof Element &&
    event.target.matches('[data-section-page][data-position="current"]')
  ) {
    finishSectionTransition();
  }
});

function navigateSection(direction, source) {
  if (!hasNeighbor(direction)) {
    return;
  }

  setSection(currentSection + direction, {
    historyMode: "push",
    focusHeading: source === "keyboard",
    source,
  });
}

function handleWheel(event) {
  if (
    isTransitioning ||
    event.ctrlKey ||
    Math.abs(event.deltaY) <= Math.abs(event.deltaX)
  ) {
    return;
  }

  if (Math.abs(event.deltaY) < 2) {
    return;
  }

  const direction = event.deltaY > 0 ? 1 : -1;
  const scroller = activeScroller();

  if (!hasNeighbor(direction)) {
    return;
  }

  if (scrollerCanScroll(scroller) && !isAtBoundary(scroller, direction)) {
    return;
  }

  event.preventDefault();
  navigateSection(direction, "wheel");
}

function handleBoundaryKey(event) {
  if (event.defaultPrevented || event.repeat || isTransitioning) {
    return;
  }

  const interactiveTarget =
    event.target instanceof Element
      ? event.target.closest(
          "button, a, input, textarea, select, [contenteditable='true']",
        )
      : null;

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
    return;
  }

  const scroller = activeScroller();

  if (
    !hasNeighbor(direction) ||
    (scrollerCanScroll(scroller) && !isAtBoundary(scroller, direction))
  ) {
    return;
  }

  event.preventDefault();
  navigateSection(direction, "keyboard");
}

function handleTouchStart(event) {
  if (event.touches.length !== 1 || isTransitioning) {
    touchStartY = null;
    return;
  }

  touchStartY = event.touches[0].clientY;
}

function handleTouchEnd(event) {
  if (
    touchStartY === null ||
    event.changedTouches.length !== 1 ||
    isTransitioning
  ) {
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

  if (!hasNeighbor(direction)) {
    return;
  }

  if (!isAtBoundary(scroller, direction)) {
    return;
  }

  navigateSection(direction, "touch");
}

function handleTouchCancel() {
  touchStartY = null;
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

sectionPages.forEach((section) => {
  const scroller = section.querySelector("[data-section-scroller]");

  scroller.addEventListener("wheel", handleWheel, { passive: false });
  scroller.addEventListener("touchstart", handleTouchStart, { passive: true });
  scroller.addEventListener("touchend", handleTouchEnd, { passive: true });
  scroller.addEventListener("touchcancel", handleTouchCancel, { passive: true });
});

document.addEventListener("keydown", handleBoundaryKey);

function syncNavigationFromLocation() {
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
}

window.addEventListener("popstate", syncNavigationFromLocation);
window.addEventListener("hashchange", syncNavigationFromLocation);

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
const projectBuildFrames = [...document.querySelectorAll("[data-build-frame]")];
const projectBuildReturnButton = document.querySelector(
  "[data-project-build-return]",
);
const projectBuildReturnLabel = document.querySelector(
  "[data-build-return-label]",
);
const projectBuildWindowTitle = document.querySelector(
  "[data-build-window-title]",
);
let projectWindowTransitionTimer = 0;
let projectPanelAnimationTimer = 0;
let extraProjectAnimationTimer = 0;

function runPageEntrance(element, direction, candidates, previousTimer) {
  window.clearTimeout(previousTimer);
  candidates.forEach((candidate) => {
    candidate.classList.remove(
      "is-page-entering-next",
      "is-page-entering-previous",
    );
  });

  if (
    !element ||
    reducedMotion.matches ||
    !document.documentElement.classList.contains("is-ready")
  ) {
    return 0;
  }

  void element.offsetWidth;
  element.classList.add(
    direction < 0 ? "is-page-entering-previous" : "is-page-entering-next",
  );

  return window.setTimeout(() => {
    element.classList.remove(
      "is-page-entering-next",
      "is-page-entering-previous",
    );
  }, 340);
}

function setBuildStatus(frame, status) {
  const panel = frame.closest("[data-project-build-panel]");
  const statusLabel = panel?.querySelector("[data-build-status-label]");

  if (!panel || !statusLabel) {
    return;
  }

  const labels = {
    idle: "Ready to load",
    loading: "Game files are loading…",
    ready: "Build running",
    error: "Build could not start",
  };

  panel.dataset.buildStatus = status;
  statusLabel.textContent = labels[status] ?? "Ready to load";
}

function unloadProjectBuilds() {
  projectBuildFrames.forEach((frame) => {
    frame.closest("[data-build-shell]")?.classList.remove("is-frame-loaded");

    if (frame.hasAttribute("src")) {
      frame.removeAttribute("src");
    }

    setBuildStatus(frame, "idle");
  });
}

function loadActiveProjectBuild() {
  const activeProject = document.body.dataset.project;
  const panel = projectBuildPanels.find(
    (buildPanel) => buildPanel.dataset.projectBuildPanel === activeProject,
  );
  const frame = panel?.querySelector("[data-build-frame]");

  if (!frame || frame.hasAttribute("src")) {
    return;
  }

  setBuildStatus(frame, "loading");
  frame.addEventListener(
    "load",
    () => {
      if (frame.hasAttribute("src")) {
        frame.closest("[data-build-shell]")?.classList.add("is-frame-loaded");
      }
    },
    { once: true },
  );
  frame.src = frame.dataset.buildSrc;
}

window.addEventListener("message", (event) => {
  if (
    event.origin !== window.location.origin ||
    event.data?.type !== "portfolio-unity-build"
  ) {
    return;
  }

  const frame = projectBuildFrames.find(
    (buildFrame) => buildFrame.contentWindow === event.source,
  );

  if (
    frame?.hasAttribute("src") &&
    ["loading", "ready", "error"].includes(event.data.state)
  ) {
    setBuildStatus(frame, event.data.state);
  }
});

function projectNameFromHash() {
  return window.location.hash.match(/^#(project-\d+)(?:$|-)/)?.[1] ?? null;
}

function projectViewFromHash() {
  return /^#project-\d+-build$/.test(window.location.hash) ? "build" : "showcase";
}

function selectedProjectTab() {
  return projectTabs.find(
    (tab) => tab.dataset.projectTab === document.body.dataset.project,
  );
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
    projectBuildLinkArrow.textContent = hasBuild ? "←" : "—";
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

  if (mode === "build" && (!hasBuild || buildAccessDisabled.matches)) {
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

  if (mode === "showcase") {
    unloadProjectBuilds();
  }

  applyProjectViewState();
  updateProjectViewButton();

  if (mode === "build") {
    loadActiveProjectBuild();
  }

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
  const selectedTab = projectTabs.find(
    (tab) => tab.dataset.projectTab === projectName,
  );

  if (!selectedTab) {
    return;
  }

  const previousProjectName = document.body.dataset.project;
  const previousProjectIndex = projectTabs.findIndex(
    (tab) => tab.dataset.projectTab === previousProjectName,
  );
  const nextProjectIndex = projectTabs.indexOf(selectedTab);
  const projectDirection =
    previousProjectIndex >= 0 && nextProjectIndex < previousProjectIndex ? -1 : 1;

  if (previousProjectName !== projectName) {
    unloadProjectBuilds();
  }

  document.body.dataset.project = projectName;
  setExtraProject(projectName, previousProjectName);

  projectTabs.forEach((tab) => {
    const isSelected = tab === selectedTab;
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  });

  projectPanels.forEach((panel) => {
    panel.hidden = panel.dataset.projectPanel !== projectName;
  });

  if (
    previousProjectName &&
    previousProjectName !== projectName &&
    document.body.dataset.section === "projects" &&
    document.body.dataset.projectView === "showcase"
  ) {
    const selectedPanel = projectPanels.find(
      (panel) => panel.dataset.projectPanel === projectName,
    );
    projectPanelAnimationTimer = runPageEntrance(
      selectedPanel,
      projectDirection,
      projectPanels,
      projectPanelAnimationTimer,
    );
  }

  applyProjectViewState();
  updateProjectViewButton();

  if (focusTab) {
    selectedTab.focus();
  }
}

function setExtraProject(projectName, previousProjectName = null) {
  const panels = [...document.querySelectorAll("[data-extra-project-panel]")];
  const selectedPanel = panels.find(
    (panel) => panel.dataset.extraProjectPanel === projectName,
  );

  if (!selectedPanel) {
    return;
  }

  panels.forEach((panel) => {
    panel.hidden = panel !== selectedPanel;
  });

  if (
    previousProjectName &&
    previousProjectName !== projectName &&
    document.body.dataset.section === "extra"
  ) {
    const previousIndex = panels.findIndex(
      (panel) => panel.dataset.extraProjectPanel === previousProjectName,
    );
    const nextIndex = panels.indexOf(selectedPanel);
    extraProjectAnimationTimer = runPageEntrance(
      selectedPanel,
      previousIndex >= 0 && nextIndex < previousIndex ? -1 : 1,
      panels,
      extraProjectAnimationTimer,
    );
  }

  document.querySelectorAll("[data-extra-project-select]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.extraProjectSelect === projectName),
    );
  });

  const title = document.querySelector("[data-extra-project-title]");
  if (title) {
    title.textContent = selectedPanel.dataset.extraProjectTitle;
  }
}

projectTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    setProject(tab.dataset.projectTab);
    setProjectView("showcase", { historyMode: "push", announce: true });
  });
  tab.addEventListener("keydown", (event) => {
    const supportedKeys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ];

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
  window.requestAnimationFrame(() => {
    projectBuildButton?.focus({ preventScroll: true });
  });
});

addMediaQueryChangeListener(buildAccessDisabled, (event) => {
  if (event.matches && document.body.dataset.projectView === "build") {
    setProjectView("showcase", { historyMode: "replace" });
  }
});

const sceneHighlightDetails = {
  clouds: {
    kicker: "Volumetric clouds",
    title: "One draw, up to 64 clouds",
    copy: "These are 3D volumes rather than flat sky cards. One shader samples through up to 64 clouds in a single GPU draw, then a compute-generated field places their shadows across the terrain.",
  },
  sky: {
    kicker: "Visual foundation",
    title: "One sun connects the whole image",
    copy: "A custom mathematical sky, the atmosphere, clouds, grass, terrain, and balls all use one directional light. That shared source keeps warm highlights and cool distance consistent as the camera moves.",
  },
  grass: {
    kicker: "GPU grass",
    title: "Dense grass in three GPU draw passes",
    copy: "The GPU decides which blades are visible and how much detail each one needs, then prepares three indirect draw commands without waiting for the CPU. A matching terrain material continues the field after individual blades fade.",
  },
  ball: {
    kicker: "Interaction",
    title: "The ball makes the meadow respond",
    copy: "The rolling ball is both the interaction and a systems test. Its physics bend nearby blades and leave trails that slowly recover while movement checks slopes, collision, speed, and camera feel.",
  },
  "map-palette": {
    kicker: "Editor and authoring",
    title: "Draw the cave, then add gameplay",
    copy: "Brush, Rectangle, and Fill shape the cave. Markers add the player start, encounters, hazards, healing, and the finish.",
  },
  "map-canvas": {
    kicker: "Editor and authoring",
    title: "A responsive 64 × 64 canvas",
    copy: "Instead of creating 4,096 separate UI objects, the 64 × 64 grid is batched into one mesh. It still shows layers, live previews, hover feedback, and warnings while keeping browser editing responsive.",
  },
  "map-readiness": {
    kicker: "Validation",
    title: "Know when the map is playable",
    copy: "Clear checks catch missing markers and broken routes before generation. Warnings stay visible without blocking a valid build.",
  },
  "marker-inspector": {
    kicker: "Editor and authoring",
    title: "Tune behavior where it belongs",
    copy: "Select a marker to set spawn direction, enemy groups, or a lamp’s wall side without leaving the map.",
  },
  "build-play": {
    kicker: "Runtime generation",
    title: "From sketch to playable cave",
    copy: "Build & Play creates the cave geometry, player collision, and the navigation routes used by enemies. It then connects the existing combat systems and starts the level.",
  },
  "content-budget": {
    kicker: "Browser constraints",
    title: "See the cost before building",
    copy: "Live counts show map size, pits, markers, and estimated triangles so oversized maps are caught early.",
  },
};

function resolveObjectPosition(value, freeSpace) {
  const normalized = value?.trim().toLowerCase() || "50%";
  const keywordPositions = {
    left: 0,
    top: 0,
    center: 0.5,
    right: 1,
    bottom: 1,
  };

  if (normalized in keywordPositions) {
    return freeSpace * keywordPositions[normalized];
  }

  if (normalized.endsWith("%")) {
    return freeSpace * (Number.parseFloat(normalized) / 100);
  }

  if (normalized.endsWith("px")) {
    return Number.parseFloat(normalized);
  }

  return freeSpace * 0.5;
}

function positionSceneHotspots(scene) {
  const image = scene.querySelector(".interactive-scene__image");
  const controls = [...scene.querySelectorAll("[data-hotspot-x][data-hotspot-y]")];
  const sceneWidth = scene.clientWidth;
  const sceneHeight = scene.clientHeight;
  const sourceWidth = Number(image?.getAttribute("width")) || image?.naturalWidth;
  const sourceHeight = Number(image?.getAttribute("height")) || image?.naturalHeight;

  if (
    !image ||
    !controls.length ||
    !sceneWidth ||
    !sceneHeight ||
    !sourceWidth ||
    !sourceHeight
  ) {
    return;
  }

  const imageStyle = window.getComputedStyle(image);
  const objectFit = imageStyle.objectFit;
  let renderedWidth = sceneWidth;
  let renderedHeight = sceneHeight;

  if (objectFit === "contain" || objectFit === "cover" || objectFit === "scale-down") {
    const containScale = Math.min(
      sceneWidth / sourceWidth,
      sceneHeight / sourceHeight,
    );
    const coverScale = Math.max(
      sceneWidth / sourceWidth,
      sceneHeight / sourceHeight,
    );
    const scale =
      objectFit === "cover"
        ? coverScale
        : objectFit === "scale-down"
          ? Math.min(1, containScale)
          : containScale;

    renderedWidth = sourceWidth * scale;
    renderedHeight = sourceHeight * scale;
  } else if (objectFit === "none") {
    renderedWidth = sourceWidth;
    renderedHeight = sourceHeight;
  }

  const [positionX = "50%", positionY = "50%"] =
    imageStyle.objectPosition.split(/\s+/);
  const offsetX = resolveObjectPosition(positionX, sceneWidth - renderedWidth);
  const offsetY = resolveObjectPosition(positionY, sceneHeight - renderedHeight);

  controls.forEach((control) => {
    const imageX = Number(control.dataset.hotspotX);
    const imageY = Number(control.dataset.hotspotY);

    if (!Number.isFinite(imageX) || !Number.isFinite(imageY)) {
      return;
    }

    control.style.setProperty(
      "--scene-hotspot-x",
      `${offsetX + renderedWidth * (imageX / 100)}px`,
    );
    control.style.setProperty(
      "--scene-hotspot-y",
      `${offsetY + renderedHeight * (imageY / 100)}px`,
    );
  });
}

const interactiveScenes = [
  ...document.querySelectorAll("[data-interactive-scene]"),
];

if ("ResizeObserver" in window) {
  const hotspotResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => positionSceneHotspots(entry.target));
  });

  interactiveScenes.forEach((scene) => hotspotResizeObserver.observe(scene));
} else {
  window.addEventListener("resize", () => {
    interactiveScenes.forEach(positionSceneHotspots);
  });
}

interactiveScenes.forEach((scene) => {
  const image = scene.querySelector(".interactive-scene__image");
  image?.addEventListener("load", () => positionSceneHotspots(scene));
  window.requestAnimationFrame(() => positionSceneHotspots(scene));
});

function initializeProjectGallery(gallery) {
  const slides = [...gallery.querySelectorAll("[data-gallery-slide]")];
  const thumbnails = [...gallery.querySelectorAll("[data-gallery-thumbnail]")];
  const previous = gallery.querySelector("[data-gallery-previous]");
  const next = gallery.querySelector("[data-gallery-next]");
  const currentLabel = gallery.querySelector("[data-gallery-current]");
  const totalLabel = gallery.querySelector("[data-gallery-total]");
  const highlightControls = [
    ...gallery.querySelectorAll("[data-scene-highlight]"),
  ];
  const scenes = slides
    .map((slide) => slide.querySelector("[data-interactive-scene]"))
    .filter(Boolean);
  const inspector = gallery
    .closest("[data-project-panel]")
    ?.querySelector("[data-scene-inspector]");
  const sceneStates = new WeakMap();
  let activeSlideIndex = 0;
  let slideAnimationTimer = 0;

  const formatIndex = (index) => String(index + 1).padStart(2, "0");
  const activeScene = () =>
    slides[activeSlideIndex]?.querySelector("[data-interactive-scene]");

  function controlsForScene(scene) {
    return highlightControls.filter((control) => {
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

  function showSceneOverview(scene, { clearPinned = false } = {}) {
    const state = sceneStates.get(scene);

    if (!state) {
      return;
    }

    if (clearPinned) {
      state.pinnedControl = null;
    }

    updateInspectorContent(state, "overview", {
      state: "overview",
      kicker: scene.dataset.sceneOverviewKicker || "Interactive picture",
      title: scene.dataset.sceneOverviewTitle || "Choose a target",
      copy:
        scene.dataset.sceneOverviewCopy ||
        "Hover on desktop or tap on a phone to show a target’s explanation. Keyboard users can focus it.",
    });

    controlsForScene(scene).forEach((control) => {
      control.classList.remove("is-active");
    });
  }

  function showSceneHighlight(scene, highlightName) {
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
    });
  }

  function restoreScene(scene) {
    const state = sceneStates.get(scene);

    if (state?.pinnedControl) {
      showSceneHighlight(
        scene,
        state.pinnedControl.dataset.sceneHighlight,
      );
      return;
    }

    showSceneOverview(scene);
  }

  function setSlide(nextIndex) {
    if (!slides.length) {
      return;
    }

    const previousSlideIndex = activeSlideIndex;
    const normalizedIndex = Math.min(Math.max(nextIndex, 0), slides.length - 1);
    activeSlideIndex = normalizedIndex;

    slides.forEach((slide, index) => {
      slide.hidden = index !== activeSlideIndex;
    });

    if (activeSlideIndex !== previousSlideIndex) {
      slideAnimationTimer = runPageEntrance(
        slides[activeSlideIndex],
        activeSlideIndex < previousSlideIndex ? -1 : 1,
        slides,
        slideAnimationTimer,
      );
    }

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

    scenes.forEach((scene) => {
      const state = sceneStates.get(scene);

      if (state) {
        window.clearTimeout(state.updateTimer);
        window.clearTimeout(state.animationTimer);
        state.currentContent = null;
        state.pendingContent = null;
        state.pinnedControl = null;
      }

      controlsForScene(scene).forEach((control) => {
        control.classList.remove("is-active");
      });
    });

    const scene = activeScene();

    if (scene) {
      showSceneOverview(scene, { clearPinned: true });
    }
  }

  scenes.forEach((scene) => {
    const state = {
      currentContent: null,
      pendingContent: null,
      updateTimer: 0,
      animationTimer: 0,
      pinnedControl: null,
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

  highlightControls.forEach((control) => {
    const controlledScene = () =>
      control.closest("[data-interactive-scene]") || activeScene();
    let lastPointerType = "";

    control.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") {
        return;
      }

      const scene = controlledScene();
      if (scene) {
        showSceneHighlight(scene, control.dataset.sceneHighlight);
      }
    });

    control.addEventListener("pointerdown", (event) => {
      lastPointerType = event.pointerType;

      if (event.pointerType !== "touch") {
        event.preventDefault();
      }
    });

    control.addEventListener("click", (event) => {
      const scene = controlledScene();
      const state = sceneStates.get(scene);
      const isTouchActivation =
        lastPointerType === "touch" ||
        (event.detail > 0 && !hoverPointer.matches);

      lastPointerType = "";

      if (!scene || !state || !isTouchActivation) {
        return;
      }

      state.pinnedControl = control;
      showSceneHighlight(scene, control.dataset.sceneHighlight);
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

function initializeExtraCarousel(carousel) {
  const slides = [...carousel.querySelectorAll("[data-extra-slide]")];
  const tabs = [...carousel.querySelectorAll("[data-extra-tab]")];
  const previous = carousel.querySelector("[data-extra-previous]");
  const next = carousel.querySelector("[data-extra-next]");
  const currentLabel = carousel.querySelector("[data-extra-current]");
  const totalLabel = carousel.querySelector("[data-extra-total]");
  let activeIndex = 0;
  let requestedIndex = 0;
  let transitionTimer = 0;
  let animationTimer = 0;

  const formatIndex = (index) => String(index + 1).padStart(2, "0");
  const wrapIndex = (index) => (index + slides.length) % slides.length;

  function applySlide(nextIndex, focusTab) {
    activeIndex = wrapIndex(nextIndex);
    requestedIndex = activeIndex;

    slides.forEach((slide, index) => {
      const isCurrent = index === activeIndex;
      slide.hidden = !isCurrent;
      slide.setAttribute("aria-hidden", String(!isCurrent));
      slide.classList.remove("is-leaving", "is-entering");
    });

    tabs.forEach((tab, index) => {
      const isCurrent = index === activeIndex;
      tab.setAttribute("aria-selected", String(isCurrent));
      tab.tabIndex = isCurrent ? 0 : -1;
    });

    if (currentLabel) {
      currentLabel.textContent = formatIndex(activeIndex);
    }

    const activeSlide = slides[activeIndex];

    if (!reducedMotion.matches && document.documentElement.classList.contains("is-ready")) {
      activeSlide.classList.add("is-entering");
      animationTimer = window.setTimeout(() => {
        activeSlide.classList.remove("is-entering");
      }, 280);
    }

    if (focusTab) {
      tabs[activeIndex]?.focus();
    }
  }

  function setExtraSlide(nextIndex, { focusTab = false } = {}) {
    if (!slides.length) {
      return;
    }

    const normalizedIndex = wrapIndex(nextIndex);
    requestedIndex = normalizedIndex;

    window.clearTimeout(transitionTimer);
    window.clearTimeout(animationTimer);
    slides.forEach((slide) => slide.classList.remove("is-leaving", "is-entering"));

    if (normalizedIndex === activeIndex) {
      if (focusTab) {
        tabs[activeIndex]?.focus();
      }
      return;
    }

    const activeSlide = slides[activeIndex];

    if (reducedMotion.matches || !document.documentElement.classList.contains("is-ready")) {
      applySlide(normalizedIndex, focusTab);
      return;
    }

    activeSlide.classList.add("is-leaving");
    transitionTimer = window.setTimeout(() => {
      applySlide(normalizedIndex, focusTab);
    }, 130);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setExtraSlide(index));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        return;
      }

      event.preventDefault();

      if (event.key === "Home") {
        setExtraSlide(0, { focusTab: true });
      } else if (event.key === "End") {
        setExtraSlide(slides.length - 1, { focusTab: true });
      } else {
        setExtraSlide(index + (event.key === "ArrowRight" ? 1 : -1), {
          focusTab: true,
        });
      }
    });
  });

  previous?.addEventListener("click", () => setExtraSlide(requestedIndex - 1));
  next?.addEventListener("click", () => setExtraSlide(requestedIndex + 1));

  if (totalLabel) {
    totalLabel.textContent = String(slides.length).padStart(2, "0");
  }

  applySlide(0, false);
}

document.querySelectorAll("[data-extra-carousel]").forEach(initializeExtraCarousel);

document.querySelectorAll("[data-extra-project-select]").forEach((button) => {
  button.addEventListener("click", () => {
    const projectName = button.dataset.extraProjectSelect;

    if (!projectName) {
      return;
    }

    setProject(projectName);

    const selectedPanel = document.querySelector(
      `[data-extra-project-panel="${projectName}"]`,
    );
    selectedPanel
      ?.querySelector(`[data-extra-project-select="${projectName}"]`)
      ?.focus({ preventScroll: true });

    if (sectionAnnouncer) {
      sectionAnnouncer.textContent =
        selectedPanel?.dataset.extraProjectTitle ?? "Project deep dive";
    }
  });
});

document.querySelectorAll("[data-project-build-jump]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    if (buildAccessDisabled.matches) {
      return;
    }

    const projectName = link.dataset.projectBuildJump;
    const projectsIndex = sectionIndexFromTarget("projects");

    if (!projectName || projectsIndex < 0) {
      return;
    }

    setProject(projectName);
    setSection(projectsIndex, {
      historyMode: "none",
      focusHeading: false,
      source: "link",
    });
    setProjectView("build", { historyMode: "push", announce: true });
  });
});

const initialSection = sectionIndexFromHash();
const initialProject = projectNameFromHash() ?? "project-1";

currentSection = initialSection;
if (sectionPages[initialSection]?.id === "projects") {
  loadDeferredProjectImages();
}

sectionPages.forEach((section, index) => {
  const isCurrent = index === initialSection;
  section.dataset.position =
    index < initialSection
      ? "before"
      : index > initialSection
        ? "after"
        : "current";
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
setProject(initialProject);
setProjectView(projectViewFromHash());

if (sectionDeck) {
  sectionDeck.scrollTop = 0;
  sectionDeck.scrollLeft = 0;
}

const initialScroller = activeScroller();
if (initialScroller) {
  initialScroller.scrollTop = 0;
  initialScroller.scrollLeft = 0;
}

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    if (sectionDeck) {
      sectionDeck.scrollTop = 0;
      sectionDeck.scrollLeft = 0;
    }

    if (initialScroller) {
      initialScroller.scrollTop = 0;
      initialScroller.scrollLeft = 0;
    }

    document.documentElement.classList.add("is-ready");
  });
});
