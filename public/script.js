"use strict";

document.documentElement.classList.add("js");

const highlights = {
  clouds: {
    kicker: "Visual systems",
    title: "Clouds",
    copy:
      "Reserved for the cloud material, shaping controls, movement, and performance notes.",
  },
  sky: {
    kicker: "Lighting and atmosphere",
    title: "Sky",
    copy:
      "Reserved for the atmosphere, color, lighting, and the choices that establish depth.",
  },
  grass: {
    kicker: "Environment systems",
    title: "Grass",
    copy:
      "Reserved for distribution, material variation, wind response, and scene-cost considerations.",
  },
  ball: {
    kicker: "Interaction and materials",
    title: "Ball",
    copy:
      "Reserved for the material, physics behavior, gameplay role, and visual response.",
  },
};

const projectTabs = [...document.querySelectorAll("[data-project-tab]")];
const projectPanels = [...document.querySelectorAll("[data-project-panel]")];
const playLink = document.querySelector("[data-play-link]");
const highlightControls = [...document.querySelectorAll("[data-highlight]")];
const inspectorKicker = document.querySelector("[data-inspector-kicker]");
const inspectorTitle = document.querySelector("[data-inspector-title]");
const inspectorCopy = document.querySelector("[data-inspector-copy]");

let activeProject = "project-1";
let pinnedHighlight = null;

function setInspectorDefault() {
  inspectorKicker.textContent = "Scene overview";
  inspectorTitle.textContent = "Choose a highlight";
  inspectorCopy.textContent =
    "Point at an annotation in the image or use this list to inspect the scene.";
}

function showHighlight(highlightName) {
  const highlight = highlights[highlightName];

  if (!highlight) {
    setInspectorDefault();
    return;
  }

  inspectorKicker.textContent = highlight.kicker;
  inspectorTitle.textContent = highlight.title;
  inspectorCopy.textContent = highlight.copy;
}

function setPinnedHighlight(highlightName) {
  pinnedHighlight = highlightName;

  highlightControls.forEach((control) => {
    const isActive = control.dataset.highlight === highlightName;
    control.classList.toggle("is-active", isActive);
    control.setAttribute("aria-pressed", String(isActive));
  });

  if (highlightName) {
    showHighlight(highlightName);
  } else {
    setInspectorDefault();
  }
}

function setProject(projectName, updateHistory = true) {
  const projectExists = projectPanels.some(
    (panel) => panel.dataset.projectPanel === projectName,
  );

  if (!projectExists) {
    return;
  }

  activeProject = projectName;
  document.body.dataset.project = projectName;
  setPinnedHighlight(null);

  projectTabs.forEach((tab) => {
    const isSelected = tab.dataset.projectTab === projectName;
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  });

  projectPanels.forEach((panel) => {
    panel.hidden = panel.dataset.projectPanel !== projectName;
  });

  if (playLink) {
    playLink.href = `#${projectName}-player`;
  }

  if (updateHistory) {
    window.history.replaceState(null, "", `#${projectName}`);
  }
}

function getProjectFromHash() {
  const hash = window.location.hash.slice(1);
  const matchingPanel = projectPanels.find(
    (panel) => hash === panel.id || hash.startsWith(`${panel.id}-`),
  );

  return matchingPanel?.id ?? null;
}

projectTabs.forEach((tab, tabIndex) => {
  tab.addEventListener("click", () => {
    setProject(tab.dataset.projectTab);
  });

  tab.addEventListener("keydown", (event) => {
    const navigationKeys = ["ArrowLeft", "ArrowRight", "Home", "End"];

    if (!navigationKeys.includes(event.key)) {
      return;
    }

    event.preventDefault();
    let nextIndex = tabIndex;

    if (event.key === "ArrowLeft") {
      nextIndex = (tabIndex - 1 + projectTabs.length) % projectTabs.length;
    } else if (event.key === "ArrowRight") {
      nextIndex = (tabIndex + 1) % projectTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = projectTabs.length - 1;
    }

    const nextTab = projectTabs[nextIndex];
    setProject(nextTab.dataset.projectTab);
    nextTab.focus();
  });
});

highlightControls.forEach((control) => {
  const highlightName = control.dataset.highlight;

  control.addEventListener("pointerenter", () => showHighlight(highlightName));
  control.addEventListener("pointerleave", () => {
    showHighlight(pinnedHighlight);
  });
  control.addEventListener("focus", () => showHighlight(highlightName));
  control.addEventListener("blur", () => showHighlight(pinnedHighlight));
  control.addEventListener("click", () => {
    setPinnedHighlight(pinnedHighlight === highlightName ? null : highlightName);
  });
  control.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setPinnedHighlight(null);
      control.blur();
    }
  });
});

window.addEventListener("hashchange", () => {
  const hashProject = getProjectFromHash();

  if (hashProject) {
    setProject(hashProject, false);
  }
});

const initialProject = getProjectFromHash() ?? activeProject;

setProject(initialProject, false);
