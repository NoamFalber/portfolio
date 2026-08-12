"use strict";

document.documentElement.classList.remove("no-js");
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
const desktopViewport = window.matchMedia("(min-width: 56.01rem)");
const buildAccessDisabled = window.matchMedia("(max-width: 42rem)");
const deferredProjectImages = [
  ...document.querySelectorAll("[data-deferred-src]"),
];
const supportsInert = "inert" in HTMLElement.prototype;
const motionDuration = Object.freeze({
  section: 820,
  pageEntrance: 440,
  projectView: 800,
  breakdownExit: 190,
  breakdownEntrance: 400,
});
const inertFocusableSelector = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "iframe",
  "[contenteditable='true']",
  "[tabindex]",
].join(",");

const sectionNames = sectionPages.map(
  (section) => section.id.charAt(0).toUpperCase() + section.id.slice(1),
);

let currentSection = 0;
let isTransitioning = false;
let transitionTimer = 0;
let transitionFocusTarget = null;
let pendingSectionRequest = null;
let touchGesture = null;

function addMediaQueryChangeListener(query, listener) {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
  } else {
    query.addListener(listener);
  }
}

function syncInertFallback() {
  if (supportsInert) {
    return;
  }

  document.querySelectorAll(inertFocusableSelector).forEach((element) => {
    const isInsideInertContent = Boolean(element.closest("[inert]"));
    const storedTabIndex = element.getAttribute("data-inert-tabindex");

    if (isInsideInertContent) {
      if (storedTabIndex === null) {
        element.setAttribute(
          "data-inert-tabindex",
          element.hasAttribute("tabindex")
            ? element.getAttribute("tabindex")
            : "__none__",
        );
      }

      element.setAttribute("tabindex", "-1");
      return;
    }

    if (storedTabIndex === null) {
      return;
    }

    if (storedTabIndex === "__none__") {
      element.removeAttribute("tabindex");
    } else {
      element.setAttribute("tabindex", storedTabIndex);
    }

    element.removeAttribute("data-inert-tabindex");
  });
}

function setElementInert(element, shouldBeInert) {
  if (!element) {
    return;
  }

  if (shouldBeInert) {
    element.setAttribute("inert", "");
  } else {
    element.removeAttribute("inert");
  }

  if (supportsInert) {
    element.inert = shouldBeInert;
  } else {
    syncInertFallback();
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
  { historyMode = "push", focusHeading = false } = {},
) {
  if (nextIndex < 0 || nextIndex >= sectionPages.length) {
    return;
  }

  if (isTransitioning && nextIndex !== currentSection) {
    pendingSectionRequest = {
      nextIndex,
      options: { historyMode, focusHeading },
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
  const destination = sectionPages[nextIndex];
  const destinationScroller = destination.querySelector("[data-section-scroller]");
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

  if (destinationScroller) {
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
    setElementInert(section, !isCurrent);
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
    transitionTimer = window.setTimeout(
      finishSectionTransition,
      motionDuration.section,
    );
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

function navigateSection(direction) {
  if (!hasNeighbor(direction)) {
    return;
  }

  setSection(currentSection + direction, {
    historyMode: "push",
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
  navigateSection(direction);
}

function handleTouchStart(event) {
  if (event.touches.length !== 1 || isTransitioning) {
    touchGesture = null;
    return;
  }

  touchGesture = {
    x: event.touches[0].clientX,
    y: event.touches[0].clientY,
  };
}

function handleTouchEnd(event) {
  if (
    touchGesture === null ||
    event.changedTouches.length !== 1 ||
    isTransitioning
  ) {
    touchGesture = null;
    return;
  }

  const distanceX = touchGesture.x - event.changedTouches[0].clientX;
  const distanceY = touchGesture.y - event.changedTouches[0].clientY;
  touchGesture = null;

  if (
    Math.abs(distanceY) < 44 ||
    Math.abs(distanceY) <= Math.abs(distanceX) * 1.15
  ) {
    return;
  }

  const direction = distanceY > 0 ? 1 : -1;
  const scroller = activeScroller();

  if (!hasNeighbor(direction)) {
    return;
  }

  if (!isAtBoundary(scroller, direction)) {
    return;
  }

  navigateSection(direction);
}

function handleTouchCancel() {
  touchGesture = null;
}

function enableHorizontalSwipe(surface, onSwipe) {
  if (!surface) {
    return;
  }

  let gesture = null;

  surface.addEventListener("pointerdown", (event) => {
    if (
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      (event.target instanceof Element &&
        event.target.closest(
          "button, a, input, textarea, select, [contenteditable='true']",
        ))
    ) {
      gesture = null;
      return;
    }

    gesture = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  });

  surface.addEventListener("pointerup", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    const distanceX = event.clientX - gesture.x;
    const distanceY = event.clientY - gesture.y;
    gesture = null;

    if (
      Math.abs(distanceX) < 52 ||
      Math.abs(distanceX) <= Math.abs(distanceY) * 1.25
    ) {
      return;
    }

    onSwipe(distanceX < 0 ? 1 : -1);
  });

  surface.addEventListener("pointercancel", () => {
    gesture = null;
  });
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

function syncNavigationFromLocation() {
  const historySection = sectionIndexFromHash();

  setSection(historySection, {
    historyMode: "none",
    focusHeading: historySection !== currentSection,
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
  }, motionDuration.pageEntrance);
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
    ready: "Build ready",
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
    !["portfolio-unity-build", "portfolio-game-build"].includes(
      event.data?.type,
    )
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
  const projectName =
    window.location.hash.match(/^#(project-\d+)(?:$|-)/)?.[1] ?? null;
  const selectedTab = projectTabs.find(
    (tab) => tab.dataset.projectTab === projectName,
  );

  return selectedTab && !selectedTab.disabled && !selectedTab.hidden
    ? projectName
    : null;
}

function projectViewFromHash() {
  return projectNameFromHash() && /^#project-\d+-build$/.test(window.location.hash)
    ? "build"
    : "showcase";
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
  }, motionDuration.projectView);
}

function applyProjectViewState() {
  const activeMode = document.body.dataset.projectView;
  const activeProject = document.body.dataset.project;

  workspaceWindows.forEach((windowElement) => {
    const isCurrentWindow = windowElement.dataset.workspaceWindow === activeMode;
    windowElement.setAttribute("aria-hidden", String(!isCurrentWindow));
    setElementInert(windowElement, !isCurrentWindow);
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
  const buildLabel = selectedTab.dataset.buildLabel || "web";

  projectBuildButton.disabled = !hasBuild;
  projectBuildButton.setAttribute("aria-disabled", String(!hasBuild));
  projectBuildButton.setAttribute(
    "aria-label",
    hasBuild
      ? `Play the ${projectTitle} ${buildLabel} build`
      : `${projectTitle} does not have a web build`,
  );

  if (projectBuildLinkKicker) {
    projectBuildLinkKicker.textContent = hasBuild
      ? `Playable ${buildLabel} build`
      : "Web build unavailable";
  }

  if (projectBuildLinkLabel) {
    projectBuildLinkLabel.textContent = hasBuild
      ? `Play ${projectTitle}`
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
      `Return to the ${projectTitle} project visual`,
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
    const buildLabel = selectedTab.dataset.buildLabel || "web";
    sectionAnnouncer.textContent = `${selectedTab.dataset.projectTitle} ${
      mode === "build" ? `${buildLabel} build` : "project visual"
    } view`;
  }
}

function setProject(projectName) {
  const selectedTab = projectTabs.find(
    (tab) => tab.dataset.projectTab === projectName,
  );

  if (!selectedTab || selectedTab.disabled || selectedTab.hidden) {
    return;
  }

  const selectableTabs = projectTabs.filter(
    (tab) => !tab.disabled && !tab.hidden,
  );
  const previousProjectName = document.body.dataset.project;
  const previousProjectIndex = selectableTabs.findIndex(
    (tab) => tab.dataset.projectTab === previousProjectName,
  );
  const nextProjectIndex = selectableTabs.indexOf(selectedTab);
  const projectDirection =
    previousProjectIndex >= 0 && nextProjectIndex < previousProjectIndex ? -1 : 1;

  if (previousProjectName !== projectName) {
    unloadProjectBuilds();
  }

  document.body.dataset.project = projectName;
  setExtraProject(projectName, previousProjectName);

  projectTabs.forEach((tab) => {
    const isSelected = tab === selectedTab;
    tab.setAttribute("aria-pressed", String(isSelected));
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

function alignProjectWorkspaceAfterControl() {
  window.requestAnimationFrame(() => {
    if (sectionDeck) {
      sectionDeck.scrollLeft = 0;
    }

    const sectionPage = projectWorkspace?.closest("[data-section-page]");
    const sectionScroller = projectWorkspace?.closest("[data-section-scroller]");

    if (sectionPage) {
      sectionPage.scrollLeft = 0;
    }

    if (!sectionScroller) {
      return;
    }

    sectionScroller.scrollLeft = 0;

    if (desktopViewport.matches) {
      sectionScroller.scrollTop = 0;
    }
  });
}

projectTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setProject(tab.dataset.projectTab);
    setProjectView("showcase", { historyMode: "push", announce: true });
    alignProjectWorkspaceAfterControl();
  });
});

projectBuildButton?.addEventListener("click", () => {
  if (!projectBuildButton.disabled) {
    setProjectView("build", { historyMode: "push", announce: true });
    alignProjectWorkspaceAfterControl();
  }
});

projectBuildReturnButton?.addEventListener("click", () => {
  setProjectView("showcase", { historyMode: "push", announce: true });
  alignProjectWorkspaceAfterControl();
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
    kicker: "Cloud rendering",
    title: "Raymarched volumetric clouds",
    copy: "The clouds are rendered as bounded 3D volumes in a single procedural draw. A shadow map generated with a compute shader projects their shade onto the grass, terrain, balls, and meadow effects.",
  },
  sun: {
    kicker: "Lighting and atmosphere",
    title: "Shared sun and atmospheric lighting",
    copy: "The sky, atmosphere, clouds, grass, terrain, and balls use the same directional light. This keeps highlights, shadows, and distance color consistent as the camera moves.",
  },
  grass: {
    kicker: "Grass rendering",
    title: "Compute culling and three grass detail levels",
    copy: "A compute shader selects only the visible grass and the right level of detail. Three indirect draws render the result, while the terrain shader continues the same grass lighting and movement into the distance.",
  },
  trail: {
    kicker: "Grass interaction",
    title: "Persistent grass trails",
    copy: "Swept sphere contact fills gaps during fast movement, while sparse pages store only touched grass in a fixed 8 MB GPU atlas. The blades recover and release that stored trail data over time.",
  },
  ball: {
    kicker: "Player movement",
    title: "Physics-driven rolling ball",
    copy: "The player steers a Rigidbody-driven ball with camera-relative control, jumping, braking, and speed-preserving turns. Its contact with the field drives the grass response.",
  },
  "map-palette": {
    kicker: "Layered map tools",
    title: "Cave geometry and gameplay markers",
    copy: "Brush, Rectangle, and Fill edit the cave footprint. Separate marker and function layers place the player start, encounters, hazards, healing, and finish without changing the underlying cave shape.",
  },
  "map-canvas": {
    kicker: "Map canvas",
    title: "A single UI mesh for 4,096 cells",
    copy: "The 64 × 64 grid, symbols, outlines, previews, hover states, and validation feedback are combined into one UI mesh. This avoids creating thousands of separate interface objects.",
  },
  "map-readiness": {
    kicker: "Map validation",
    title: "Build readiness checks",
    copy: "The checklist catches missing markers, invalid layer combinations, broken routes, and content budget errors before generation. Warnings stay visible but do not stop a valid map from building.",
  },
  "marker-inspector": {
    kicker: "Marker inspector",
    title: "Settings for the selected marker",
    copy: "The inspector edits spawn direction, encounter contents, and a lamp’s valid wall side beside the map. The user does not have to open a separate editor.",
  },
  "build-play": {
    kicker: "Build and Play",
    title: "From 2D map to playable cave",
    copy: "Build & Play validates a snapshot, generates the cave geometry and collision, builds ground and flying navigation, connects the existing combat systems, and starts the level.",
  },
  "content-budget": {
    kicker: "Content budget",
    title: "Live generation cost estimates",
    copy: "The workshop tracks cave size, pits, markers, enemies, and estimated geometry as the map changes. It blocks documents that would ask the browser to generate more than the defined limits.",
  },
  "species-arrival": {
    kicker: "Spacecraft arrivals",
    title: "Generate and introduce new species",
    copy: "The spacecraft creates a new body plan, then introduces its first creature through a complete landing and beam sequence.",
  },
  "creature-anatomy": {
    kicker: "Procedural anatomy",
    title: "Anatomy-driven creatures",
    copy: "Each species is generated as a connected body plan. The same anatomy shapes its appearance, animation, movement, speed, and Energy use.",
  },
  "world-simulation": {
    kicker: "Living-world simulation",
    title: "Creatures move through a deterministic world",
    copy: "Creatures rest, choose destinations, navigate around obstacles, and move through the world on fixed simulation ticks.",
  },
  "lifecycle-tools": {
    kicker: "Creature lifecycle",
    title: "Trash and duplication machines",
    copy: "Players can drag creatures into either machine. The animated tools either remove one creature or create two new creatures from the same species.",
  },
  "simulation-sidebar": {
    kicker: "World controls",
    title: "World time and simulation speed",
    copy: "The live panel shows day, time, and phase, then lets the player run the simulation at 0.5x, 1x, 2x, or 4x speed.",
  },
  "performance-sidebar": {
    kicker: "Browser performance",
    title: "Measure performance while the world runs",
    copy: "Frame rate, frame time, and simulation pace stay visible while the WebAssembly build is running.",
  },
  "creature-inspection": {
    kicker: "Creature inspection",
    title: "Live creature details",
    copy: "Select any creature to inspect its generated species, body, movement, Energy, condition, and current activity.",
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
    const useSmallPosition = buildAccessDisabled.matches;
    const imageX = Number(
      useSmallPosition
        ? control.dataset.hotspotSmallX ?? control.dataset.hotspotX
        : control.dataset.hotspotX,
    );
    const imageY = Number(
      useSmallPosition
        ? control.dataset.hotspotSmallY ?? control.dataset.hotspotY
        : control.dataset.hotspotY,
    );

    if (!Number.isFinite(imageX) || !Number.isFinite(imageY)) {
      return;
    }

    const controlMarginX = control.offsetWidth / 2 + 2;
    const controlMarginY = control.offsetHeight / 2 + 2;
    const desiredX = offsetX + renderedWidth * (imageX / 100);
    const desiredY = offsetY + renderedHeight * (imageY / 100);
    const clampedX = Math.min(
      sceneWidth - controlMarginX,
      Math.max(controlMarginX, desiredX),
    );
    const clampedY = Math.min(
      sceneHeight - controlMarginY,
      Math.max(controlMarginY, desiredY),
    );

    control.style.setProperty(
      "--scene-hotspot-x",
      `${clampedX}px`,
    );
    control.style.setProperty(
      "--scene-hotspot-y",
      `${clampedY}px`,
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

addMediaQueryChangeListener(buildAccessDisabled, () => {
  interactiveScenes.forEach(positionSceneHotspots);
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
      kicker: scene.dataset.sceneOverviewKicker || "Project visual",
      title: scene.dataset.sceneOverviewTitle || "Choose a target",
      copy:
        scene.dataset.sceneOverviewCopy ||
        "Select a highlighted area to read its technical breakdown.",
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

    control.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") {
        return;
      }

      const scene = controlledScene();
      if (scene) {
        showSceneHighlight(scene, control.dataset.sceneHighlight);
      }
    });

    control.addEventListener("focus", () => {
      const scene = controlledScene();
      if (scene) {
        showSceneHighlight(scene, control.dataset.sceneHighlight);
      }
    });

    control.addEventListener("click", () => {
      const scene = controlledScene();
      const state = sceneStates.get(scene);

      if (!scene || !state) {
        return;
      }

      if (state.pinnedControl === control) {
        showSceneOverview(scene, { clearPinned: true });
      } else {
        state.pinnedControl = control;
        showSceneHighlight(scene, control.dataset.sceneHighlight);
      }
    });

    control.addEventListener("pointerleave", () => {
      const scene = controlledScene();
      if (scene && document.activeElement !== control) {
        restoreScene(scene);
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
  enableHorizontalSwipe(gallery.querySelector(".gallery-slides"), (direction) => {
    setSlide(activeSlideIndex + direction);
  });

  if (totalLabel) {
    totalLabel.textContent = String(slides.length).padStart(2, "0");
  }

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
  const sectionPage = carousel.closest("[data-section-page]");
  const sectionScroller = carousel.closest("[data-section-scroller]");
  const compactBreakdown = window.matchMedia(
    "(max-width: 42rem), (max-height: 42rem)",
  );
  let activeIndex = 0;
  let requestedIndex = 0;
  let transitionTimer = 0;
  let animationTimer = 0;

  const formatIndex = (index) => String(index + 1).padStart(2, "0");
  const wrapIndex = (index) => (index + slides.length) % slides.length;

  function applySlide(nextIndex) {
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
      tab.setAttribute("aria-pressed", String(isCurrent));
    });

    if (currentLabel) {
      currentLabel.textContent = formatIndex(activeIndex);
    }

    const activeSlide = slides[activeIndex];

    if (document.documentElement.classList.contains("is-ready")) {
      activeSlide.classList.add("is-entering");
      animationTimer = window.setTimeout(() => {
        activeSlide.classList.remove("is-entering");
      }, motionDuration.breakdownEntrance);
    }
  }

  function setExtraSlide(nextIndex) {
    if (!slides.length) {
      return;
    }

    const normalizedIndex = wrapIndex(nextIndex);
    requestedIndex = normalizedIndex;

    window.clearTimeout(transitionTimer);
    window.clearTimeout(animationTimer);
    slides.forEach((slide) => slide.classList.remove("is-leaving", "is-entering"));

    if (normalizedIndex === activeIndex) {
      return;
    }

    const activeSlide = slides[activeIndex];

    if (!document.documentElement.classList.contains("is-ready")) {
      applySlide(normalizedIndex);
      return;
    }

    activeSlide.classList.add("is-leaving");
    transitionTimer = window.setTimeout(() => {
      applySlide(normalizedIndex);
    }, motionDuration.breakdownExit);
  }

  function alignCarouselAfterControl() {
    window.requestAnimationFrame(() => {
      if (sectionDeck) {
        sectionDeck.scrollLeft = 0;
      }

      if (sectionPage) {
        sectionPage.scrollLeft = 0;
        sectionPage.scrollTop = 0;
      }

      if (!sectionScroller) {
        return;
      }

      sectionScroller.scrollLeft = 0;

      if (!compactBreakdown.matches) {
        return;
      }

      const scrollerBox = sectionScroller.getBoundingClientRect();
      const carouselBox = carousel.getBoundingClientRect();
      const carouselTop =
        sectionScroller.scrollTop + carouselBox.top - scrollerBox.top;

      sectionScroller.scrollTo({
        top: Math.max(0, carouselTop),
        left: 0,
        behavior: "auto",
      });
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      setExtraSlide(index);
      alignCarouselAfterControl();
    });
  });

  previous?.addEventListener("click", () => {
    setExtraSlide(requestedIndex - 1);
    alignCarouselAfterControl();
  });
  next?.addEventListener("click", () => {
    setExtraSlide(requestedIndex + 1);
    alignCarouselAfterControl();
  });
  enableHorizontalSwipe(carousel.querySelector(".extra-stage"), (direction) => {
    setExtraSlide(requestedIndex + direction);
  });

  if (totalLabel) {
    totalLabel.textContent = String(slides.length).padStart(2, "0");
  }

  applySlide(0);
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

    if (sectionDeck) {
      sectionDeck.scrollLeft = 0;
    }

    const sectionPage = selectedPanel?.closest("[data-section-page]");
    if (sectionPage) {
      sectionPage.scrollLeft = 0;
      sectionPage.scrollTop = 0;
    }

    const sectionScroller = selectedPanel?.closest("[data-section-scroller]");
    if (sectionScroller) {
      sectionScroller.scrollLeft = 0;
    }

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
  setElementInert(section, !isCurrent);
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
