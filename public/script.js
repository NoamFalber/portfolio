"use strict";

const projectSections = [...document.querySelectorAll("[data-project-section]")];
const projectLinks = [...document.querySelectorAll("[data-project-link]")];
const themeColor = document.querySelector('meta[name="theme-color"]');

let themeFrame = null;

function setActiveProject(projectName) {
  const project = projectSections.find(
    (section) => section.dataset.projectSection === projectName,
  );

  if (!project) {
    return;
  }

  if (document.body.dataset.project === projectName) {
    return;
  }

  document.body.dataset.project = projectName;
  themeColor?.setAttribute("content", project.dataset.themeColor);

  projectLinks.forEach((link) => {
    if (link.dataset.projectLink === projectName) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function getProjectAtViewportCenter() {
  const viewportCenter = window.innerHeight * 0.5;
  let nearestProject = projectSections[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const project of projectSections) {
    const bounds = project.getBoundingClientRect();

    if (bounds.top <= viewportCenter && bounds.bottom > viewportCenter) {
      return project.dataset.projectSection;
    }

    const distance = Math.min(
      Math.abs(bounds.top - viewportCenter),
      Math.abs(bounds.bottom - viewportCenter),
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestProject = project;
    }
  }

  return nearestProject.dataset.projectSection;
}

function updateThemeFromScroll() {
  themeFrame = null;
  setActiveProject(getProjectAtViewportCenter());
}

function scheduleThemeUpdate() {
  if (themeFrame === null) {
    themeFrame = window.requestAnimationFrame(updateThemeFromScroll);
  }
}

window.addEventListener("scroll", scheduleThemeUpdate, { passive: true });
window.addEventListener("resize", scheduleThemeUpdate);
window.addEventListener("pageshow", scheduleThemeUpdate);
window.addEventListener("hashchange", scheduleThemeUpdate);

scheduleThemeUpdate();
