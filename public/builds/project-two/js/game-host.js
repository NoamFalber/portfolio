window.monogameSimulation = (() => {
    const sampleCapacity = 2048;
    const frameIntervals = new Float64Array(sampleCapacity);
    const managedBoundaries = new Float64Array(sampleCapacity);
    const layoutModeNames = ["standard", "compact", "minimum-size"];
    const listenerCleanups = [];

    let animationFrame = null;
    let canvas = null;
    let diagnosticRequests = 0;
    let dprMediaQuery = null;
    let environmentCommitInFlight = false;
    let environmentDirty = false;
    let environmentTimer = null;
    let exactDiagnostics = null;
    let firstFrameAt = null;
    let frameNumber = 0;
    let instance = null;
    let lastFrameTimestamp = null;
    let lastSizing = null;
    let nextSample = 0;
    let options = null;
    let resizeEvents = 0;
    let resizeObserver = null;
    let sampleCount = 0;
    let startRequestedAt = null;
    let stopped = false;

    function postPortfolioStatus(status) {
        if (window.parent === window) return;

        const state = status === "running" || status === "setup"
            ? "ready"
            : status === "failed"
                ? "error"
                : "loading";
        window.parent.postMessage(
            { type: "portfolio-game-build", state },
            window.location.origin);
    }

    function setStatus(status, message) {
        const shell = document.getElementById("game-shell");
        if (shell) shell.dataset.gameStatus = status;
        const loading = document.getElementById("loading-message");
        if (loading && message) loading.textContent = message;
        postPortfolioStatus(status);
    }

    const setupObserver = new MutationObserver(() => {
        const shell = document.getElementById("game-shell");
        if (shell?.dataset.gameStatus !== "setup") return;
        postPortfolioStatus("setup");
        setupObserver.disconnect();
    });
    setupObserver.observe(document.getElementById("app"), {
        childList: true,
        subtree: true
    });

    function clearLifecycle() {
        if (animationFrame !== null) {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        if (environmentTimer !== null) {
            window.clearTimeout(environmentTimer);
            environmentTimer = null;
        }
        resizeObserver?.disconnect();
        resizeObserver = null;
        if (dprMediaQuery) {
            dprMediaQuery.removeEventListener("change", queueEnvironment);
            dprMediaQuery = null;
        }
        while (listenerCleanups.length > 0) {
            listenerCleanups.pop()();
        }
    }

    function fail(message) {
        if (stopped) return;
        stopped = true;
        clearLifecycle();
        setStatus("failed", message);
        const panel = document.getElementById("error-panel");
        if (instance) {
            instance.invokeMethodAsync("NotifyRuntimeFailure", `${message}`)
                .catch(error => console.error(error));
        } else if (panel) {
            panel.hidden = false;
            panel.textContent = `${message} Reload the page to retry.`;
        } else {
            const bootPanel = document.getElementById("blazor-error-ui");
            if (bootPanel) {
                bootPanel.hidden = false;
                bootPanel.textContent =
                    `${message} Reload the page to restart the client.`;
            }
        }
        console.error(message);
    }

    function listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        listenerCleanups.push(() => target.removeEventListener(type, handler, options));
    }

    function applyCanvasPreferences() {
        canvas.style.cursor = options.showMouseCursor ? "default" : "none";
        if (options.startMaximized && options.allowResizing) {
            canvas.classList.remove("windowed");
            return;
        }

        canvas.classList.add("windowed");
        canvas.style.width = `${options.initialWidth}px`;
        canvas.style.height = `${options.initialHeight}px`;
    }

    function isFocused() {
        return document.hasFocus() && document.visibilityState === "visible";
    }

    function armDprListener() {
        if (dprMediaQuery) {
            dprMediaQuery.removeEventListener("change", queueEnvironment);
        }
        dprMediaQuery = window.matchMedia(
            `(resolution: ${window.devicePixelRatio || 1}dppx)`);
        dprMediaQuery.addEventListener("change", queueEnvironment, { once: true });
    }

    function queueEnvironment() {
        if (stopped || !instance) return;
        resizeEvents += 1;
        environmentDirty = true;
        if (environmentTimer !== null) {
            window.clearTimeout(environmentTimer);
        }
        environmentTimer = window.setTimeout(() => {
            environmentTimer = null;
            void commitEnvironment();
        }, 100);
    }

    async function commitEnvironment() {
        if (stopped || !instance || environmentCommitInFlight) return;
        environmentCommitInFlight = true;
        environmentDirty = false;
        try {
            const bounds = canvas.getBoundingClientRect();
            if (!Number.isFinite(bounds.width) ||
                !Number.isFinite(bounds.height) ||
                bounds.width < 1 ||
                bounds.height < 1) {
                return;
            }

            const sizing = await instance.invokeMethodAsync(
                "ResolveCanvasSizing",
                bounds.width,
                bounds.height,
                window.devicePixelRatio || 1);
            if (stopped) return;
            if (lastSizing?.changeId === sizing.changeId) {
                armDprListener();
                return;
            }

            canvas.width = sizing.backBufferWidth;
            canvas.height = sizing.backBufferHeight;
            const mode = layoutModeNames[sizing.layoutMode] ?? "unknown";
            const shell = document.getElementById("game-shell");
            if (shell) {
                shell.dataset.layoutMode = mode;
                shell.dataset.cssViewport = `${sizing.cssWidth}x${sizing.cssHeight}`;
                shell.dataset.backBuffer =
                    `${sizing.backBufferWidth}x${sizing.backBufferHeight}`;
                shell.dataset.logicalViewport =
                    `${sizing.logicalWidth}x${sizing.logicalHeight}`;
                shell.dataset.renderScale = sizing.renderScale;
            }
            const minimumSizePanel = document.getElementById("minimum-size-panel");
            if (minimumSizePanel) minimumSizePanel.hidden = sizing.isPlayable;

            await instance.invokeMethodAsync(
                "ApplyBrowserState",
                sizing.changeId,
                isFocused());
            if (canvas.width !== sizing.backBufferWidth ||
                canvas.height !== sizing.backBufferHeight) {
                throw new Error(
                    `Graphics applied ${canvas.width}x${canvas.height}; ` +
                    `expected ${sizing.backBufferWidth}x${sizing.backBufferHeight}.`);
            }
            lastSizing = sizing;
            armDprListener();
        } catch (error) {
            fail(`Browser sizing failed: ${error}`);
        } finally {
            environmentCommitInFlight = false;
            if (environmentDirty && !stopped) queueEnvironment();
        }
    }

    function recordFrame(timestamp, boundaryMilliseconds) {
        if (lastFrameTimestamp !== null) {
            frameIntervals[nextSample] = timestamp - lastFrameTimestamp;
            managedBoundaries[nextSample] = boundaryMilliseconds;
            nextSample = (nextSample + 1) % sampleCapacity;
            sampleCount = Math.min(sampleCount + 1, sampleCapacity);
        }
        lastFrameTimestamp = timestamp;
    }

    function resetPerformanceMeasurements() {
        sampleCount = 0;
        nextSample = 0;
        lastFrameTimestamp = null;
    }

    function summarize(samples) {
        if (sampleCount === 0) {
            return { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, maximum: 0 };
        }
        const values = new Array(sampleCount);
        let sum = 0;
        for (let index = 0; index < sampleCount; index += 1) {
            values[index] = samples[index];
            sum += values[index];
        }
        values.sort((left, right) => left - right);
        const percentile = value =>
            values[Math.min(values.length - 1, Math.floor((values.length - 1) * value))];
        return {
            count: sampleCount,
            mean: sum / sampleCount,
            p50: percentile(0.5),
            p95: percentile(0.95),
            p99: percentile(0.99),
            maximum: values[values.length - 1]
        };
    }

    function publishDiagnosticsToDom(diagnostics) {
        const shell = document.getElementById("game-shell");
        if (!shell) return;
        shell.dataset.completedTicks = diagnostics.completedTicks;
        shell.dataset.stateHash = diagnostics.stateHash;
        shell.dataset.scene = diagnostics.scene;
        shell.dataset.selectedBeing = diagnostics.selectedBeing ?? "";
        shell.dataset.drawnFrames = diagnostics.drawnFrames;
        shell.dataset.backBuffer =
            `${diagnostics.backBufferWidth}x${diagnostics.backBufferHeight}`;
        shell.dataset.cameraCenter =
            `${diagnostics.cameraCenterX},${diagnostics.cameraCenterY}`;
        shell.dataset.cameraZoom = diagnostics.cameraZoom;
        shell.dataset.timeScale = diagnostics.timeScale;
        shell.dataset.mousePosition = `${diagnostics.mouseX},${diagnostics.mouseY}`;
        shell.dataset.framesPerSecond = diagnostics.performance.framesPerSecond;
        shell.dataset.averageFrameMilliseconds =
            diagnostics.performance.averageFrameMilliseconds;
        shell.dataset.managedMemoryBytes = diagnostics.performance.managedMemoryBytes;
        shell.dataset.simulationConfigurationHash =
            diagnostics.simulationConfigurationHash;
        shell.dataset.speciesCatalogHash = diagnostics.speciesCatalogHash;
        shell.dataset.locomotionCatalogHash = diagnostics.locomotionCatalogHash;
        shell.dataset.speciesPresentationHash = diagnostics.speciesPresentationHash;
        shell.dataset.candidateCount = diagnostics.candidateCount;
    }

    async function refreshDiagnostics() {
        if (stopped || !instance) throw new Error("The browser game is not running.");
        diagnosticRequests += 1;
        exactDiagnostics = await instance.invokeMethodAsync("GetDiagnostics");
        publishDiagnosticsToDom(exactDiagnostics);
        return exactDiagnostics;
    }

    async function heartbeat() {
        if (stopped || !instance) throw new Error("The browser game is not running.");
        return instance.invokeMethodAsync("GetHeartbeat");
    }

    function frame(timestamp) {
        animationFrame = null;
        if (stopped || !instance) return;
        if (environmentCommitInFlight) {
            animationFrame = window.requestAnimationFrame(frame);
            return;
        }

        const startedAt = performance.now();
        try {
            animationFrame = window.requestAnimationFrame(frame);
            instance.invokeMethod("TickDotNet");
            const completedAt = performance.now();
            frameNumber += 1;
            recordFrame(timestamp, completedAt - startedAt);
            if (frameNumber === 1) {
                firstFrameAt = completedAt;
                setStatus("running");
                instance.invokeMethodAsync("NotifyFirstFrameReady")
                    .catch(error => fail(`First-frame handoff failed: ${error}`));
            }
        } catch (error) {
            fail(`Runtime failed: ${error}`);
        }
    }

    function handleFocus() {
        if (stopped || !instance) return;
        try {
            instance.invokeMethod("SetBrowserFocus", isFocused());
        } catch (error) {
            fail(`Focus update failed: ${error}`);
        }
    }

    window.addEventListener("error", event => {
        fail(`Browser error: ${event.message || "Unknown JavaScript failure."}`);
    });
    window.addEventListener("unhandledrejection", event => {
        fail(`Browser promise failed: ${event.reason || "Unknown promise rejection."}`);
    });

    return {
        nextPaint() {
            return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
        },
        randomSeed() {
            if (!window.crypto?.getRandomValues || typeof BigUint64Array === "undefined") {
                throw new Error("This browser does not provide 64-bit cryptographic entropy.");
            }
            const values = new BigUint64Array(1);
            do {
                window.crypto.getRandomValues(values);
            } while (values[0] === 0n);
            return values[0].toString(10);
        },
        diagnostics() {
            return exactDiagnostics;
        },
        refreshDiagnostics,
        heartbeat,
        resetPerformanceMeasurements,
        setDetailedPerformanceDiagnostics(enabled) {
            if (stopped || !instance) {
                throw new Error("The browser game is not running.");
            }
            instance.invokeMethod("SetDetailedPerformanceDiagnostics", enabled === true);
        },
        async performanceReport() {
            const diagnostics = await refreshDiagnostics();
            return {
                capturedAt: new Date().toISOString(),
                startupMilliseconds: firstFrameAt === null || startRequestedAt === null
                    ? null
                    : firstFrameAt - startRequestedAt,
                frameNumber,
                frameInterval: summarize(frameIntervals),
                managedBoundary: summarize(managedBoundaries),
                resizeEvents,
                diagnosticRequests,
                sizing: lastSizing,
                diagnostics
            };
        },
        async start(dotNetInstance, hostOptions) {
            clearLifecycle();
            instance = dotNetInstance;
            options = hostOptions;
            stopped = false;
            setStatus("generating");
            frameNumber = 0;
            resetPerformanceMeasurements();
            exactDiagnostics = null;
            diagnosticRequests = 0;
            resizeEvents = 0;
            lastSizing = null;
            environmentCommitInFlight = false;
            environmentDirty = false;
            startRequestedAt = performance.now();
            firstFrameAt = null;
            canvas = document.getElementById("theCanvas");
            applyCanvasPreferences();

            const contextMenu = event => event.preventDefault();
            const capturePointer = event => {
                canvas.focus();
                if (canvas.setPointerCapture && event.pointerId !== undefined) {
                    canvas.setPointerCapture(event.pointerId);
                }
            };
            const releasePointer = event => {
                if (canvas.hasPointerCapture?.(event.pointerId)) {
                    canvas.releasePointerCapture(event.pointerId);
                }
            };
            const contextLost = event => {
                event.preventDefault();
                fail("WebGL context was lost.");
            };
            const toggleControls = event => {
                if (event.code !== "KeyC" || event.repeat ||
                    event.ctrlKey || event.altKey || event.metaKey) {
                    return;
                }

                event.preventDefault();
                instance.invokeMethodAsync("ToggleControlsAsync")
                    .catch(error => fail(`Controls toggle failed: ${error}`));
            };
            const preventGameKeys = event => {
                if ([27, 32, 37, 38, 39, 40].includes(event.keyCode)) {
                    event.preventDefault();
                }
            };
            const preventWheel = event => event.preventDefault();
            listen(canvas, "contextmenu", contextMenu);
            listen(canvas, "pointerdown", capturePointer);
            listen(canvas, "pointerup", releasePointer);
            listen(canvas, "pointercancel", releasePointer);
            listen(canvas, "webglcontextlost", contextLost);
            listen(window, "keydown", toggleControls);
            listen(window, "keydown", preventGameKeys);
            listen(window, "wheel", preventWheel, { passive: false });
            listen(window, "focus", handleFocus);
            listen(window, "blur", handleFocus);
            listen(document, "visibilitychange", handleFocus);
            listen(window, "resize", queueEnvironment);
            resizeObserver = new ResizeObserver(queueEnvironment);
            resizeObserver.observe(canvas);

            environmentDirty = false;
            await commitEnvironment();
            if (!stopped) animationFrame = window.requestAnimationFrame(frame);
        },
        stop() {
            stopped = true;
            clearLifecycle();
            instance = null;
            options = null;
            canvas = null;
        },
        fail
    };
})();
