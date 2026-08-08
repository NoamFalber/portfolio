"use strict";

const projects = {
  "project-one": {
    index: "01",
    title: "Project One",
    kicker: "Featured project",
    summary:
      "A visual scene presented as an interactive breakdown. Explore the image to reveal the technical topics behind each element.",
    discipline: "Technical art & development",
    hasScene: true,
  },
  "project-two": {
    index: "02",
    title: "Project Two",
    kicker: "Project slot",
    summary:
      "The second project is ready for its final visual, story, and technical breakdown.",
    discipline: "Details to be added",
    hasScene: false,
  },
  "project-three": {
    index: "03",
    title: "Project Three",
    kicker: "Project slot",
    summary:
      "The third project is ready for its final visual, story, and technical breakdown.",
    discipline: "Details to be added",
    hasScene: false,
  },
};

const hotspots = {
  clouds: {
    index: "01",
    eyebrow: "Visual systems",
    title: "Cloud rendering",
    copy:
      "This section is reserved for the cloud material, shaping controls, movement, and performance notes.",
  },
  sky: {
    index: "02",
    eyebrow: "Lighting & atmosphere",
    title: "Sky treatment",
    copy:
      "This breakdown will cover how the atmosphere, color, and lighting establish depth and the scene’s visual direction.",
  },
  grass: {
    index: "03",
    eyebrow: "Environment systems",
    title: "Grass surface",
    copy:
      "This section will explain distribution, material variation, wind response, and scene-cost considerations.",
  },
  ball: {
    index: "04",
    eyebrow: "Interaction & materials",
    title: "Interactive focal point",
    copy:
      "This section will document the ball’s material, physics behavior, gameplay role, and visual response.",
  },
};

const projectTabs = [...document.querySelectorAll("[data-project]")].filter(
  (element) => element.matches(".project-tab"),
);
const projectPanel = document.querySelector("#project-panel");
const projectIndex = document.querySelector("[data-project-index]");
const projectKicker = document.querySelector("[data-project-kicker]");
const projectTitle = document.querySelector("[data-project-title]");
const projectSummary = document.querySelector("[data-project-summary]");
const projectDiscipline = document.querySelector("[data-project-discipline]");
const sceneImage = document.querySelector("[data-scene-image]");
const scenePlaceholder = document.querySelector("[data-scene-placeholder]");
const placeholderIndex = document.querySelector("[data-placeholder-index]");
const placeholderTitle = document.querySelector("[data-placeholder-title]");
const hotspotLayer = document.querySelector("[data-hotspot-layer]");
const hotspotButtons = [...document.querySelectorAll("[data-hotspot]")];
const sceneLabel = document.querySelector("[data-scene-label]");
const sceneInstruction = document.querySelector("[data-scene-instruction]");
const inspectorCount = document.querySelector("[data-inspector-count]");
const inspectorEyebrow = document.querySelector("[data-inspector-eyebrow]");
const inspectorTitle = document.querySelector("[data-inspector-title]");
const inspectorCopy = document.querySelector("[data-inspector-copy]");
const inspectorFooter = document.querySelector("[data-inspector-footer]");
const buildProject = document.querySelector("[data-build-project]");
const buildTitle = document.querySelector("[data-build-title]");
const buildCopy = document.querySelector("[data-build-copy]");

let activeProject = "project-one";
let pinnedHotspot = null;

function setInspectorDefault(project) {
  if (project.hasScene) {
    inspectorCount.textContent = "00 / 04";
    inspectorEyebrow.textContent = "Interactive scene";
    inspectorTitle.textContent = "Explore the scene";
    inspectorCopy.textContent =
      "Each marker opens a short technical note. Start with the sky, clouds, grass, or ball.";
    inspectorFooter.textContent = "Four areas to inspect";
    return;
  }

  inspectorCount.textContent = `${project.index} / 03`;
  inspectorEyebrow.textContent = "Project placeholder";
  inspectorTitle.textContent = "Breakdown coming next";
  inspectorCopy.textContent =
    "This space is prepared for the project image, contribution summary, and technical evidence.";
  inspectorFooter.textContent = "Ready for project details";
}

function showHotspot(hotspotName) {
  const hotspot = hotspots[hotspotName];

  if (!hotspot) {
    setInspectorDefault(projects[activeProject]);
    return;
  }

  inspectorCount.textContent = `${hotspot.index} / 04`;
  inspectorEyebrow.textContent = hotspot.eyebrow;
  inspectorTitle.textContent = hotspot.title;
  inspectorCopy.textContent = hotspot.copy;
  inspectorFooter.textContent = "Technical note selected";
}

function clearPinnedHotspot() {
  pinnedHotspot = null;
  hotspotButtons.forEach((button) => {
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
  });
}

function setProject(projectName) {
  const project = projects[projectName];

  if (!project) {
    return;
  }

  activeProject = projectName;
  clearPinnedHotspot();
  document.body.dataset.project = projectName;
  projectPanel.setAttribute("aria-labelledby", `${projectName}-tab`);

  projectTabs.forEach((tab) => {
    const isSelected = tab.dataset.project === projectName;
    tab.classList.toggle("is-active", isSelected);
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  });

  projectIndex.textContent = project.index;
  projectKicker.textContent = project.kicker;
  projectTitle.textContent = project.title;
  projectSummary.textContent = project.summary;
  projectDiscipline.textContent = project.discipline;

  sceneImage.hidden = !project.hasScene;
  hotspotLayer.hidden = !project.hasScene;
  sceneInstruction.hidden = !project.hasScene;
  scenePlaceholder.hidden = project.hasScene;
  sceneLabel.innerHTML = project.hasScene
    ? '<span class="status-dot" aria-hidden="true"></span>Interactive breakdown'
    : '<span class="status-dot" aria-hidden="true"></span>Project slot';

  placeholderIndex.textContent = project.index;
  placeholderTitle.textContent = project.title;
  setInspectorDefault(project);

  buildProject.textContent = `${project.title} / Unity WebGL`;
  buildTitle.textContent = `${project.title} — WebGL build`;
  buildCopy.textContent = `The playable build for ${project.title} will load here when it is ready.`;
}

projectTabs.forEach((tab, tabIndex) => {
  tab.addEventListener("click", () => setProject(tab.dataset.project));

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
    setProject(nextTab.dataset.project);
    nextTab.focus();
  });
});

hotspotButtons.forEach((button) => {
  const hotspotName = button.dataset.hotspot;

  button.addEventListener("pointerenter", () => showHotspot(hotspotName));
  button.addEventListener("pointerleave", () => {
    showHotspot(pinnedHotspot);
  });
  button.addEventListener("focus", () => showHotspot(hotspotName));
  button.addEventListener("blur", () => showHotspot(pinnedHotspot));
  button.addEventListener("click", () => {
    const shouldPin = pinnedHotspot !== hotspotName;
    clearPinnedHotspot();

    if (shouldPin) {
      pinnedHotspot = hotspotName;
      button.classList.add("is-selected");
      button.setAttribute("aria-pressed", "true");
      showHotspot(hotspotName);
    } else {
      setInspectorDefault(projects[activeProject]);
    }
  });

  button.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearPinnedHotspot();
      setInspectorDefault(projects[activeProject]);
      button.blur();
    }
  });
});

setProject(activeProject);
