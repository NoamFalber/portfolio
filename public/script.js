"use strict";

const projectSections = [...document.querySelectorAll("[data-project-section]")];
const projectLinks = [...document.querySelectorAll("[data-project-link]")];
const themeSections = [...document.querySelectorAll("[data-theme-project]")];
const themeColor = document.querySelector('meta[name="theme-color"]');

function setActiveProject(projectName) {
  const project = projectSections.find(
    (section) => section.dataset.projectSection === projectName,
  );

  if (!project || document.body.dataset.project === projectName) {
    return;
  }

  document.body.dataset.project = projectName;
  themeColor?.setAttribute("content", project.dataset.themeColor);

  projectLinks.forEach((link) => {
    const isActive = link.dataset.projectLink === projectName;

    if (isActive) {
      link.setAttribute("aria-current", "true");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

projectLinks.forEach((link) => {
  link.addEventListener("click", () => {
    setActiveProject(link.dataset.projectLink);
  });
});

const hashProject = window.location.hash.slice(1);

if (projectSections.some((section) => section.id === hashProject)) {
  setActiveProject(hashProject);
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      const activeEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (activeEntry) {
        setActiveProject(activeEntry.target.dataset.themeProject);
      }
    },
    {
      rootMargin: "-32% 0px -52% 0px",
      threshold: [0, 0.01],
    },
  );

  themeSections.forEach((section) => observer.observe(section));
}
