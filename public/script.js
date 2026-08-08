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
  setSection(sectionIndexFromHash(), {
    historyMode: "none",
    focusHeading: true,
    source: "history",
  });
});

const projectTabs = [...document.querySelectorAll("[data-project-tab]")];
const projectPanels = [...document.querySelectorAll("[data-project-panel]")];

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

  if (focusTab) {
    selectedTab.focus();
  }
}

projectTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => setProject(tab.dataset.projectTab));
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
  });
});

const initialSection = sectionIndexFromHash();
const initialProject = window.location.hash.startsWith("#project-")
  ? window.location.hash.slice(1)
  : "project-1";

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

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => document.documentElement.classList.add("is-ready"));
});
