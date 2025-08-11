// ==UserScript==
// @name         Claude Project Documents Exporter Library
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Export Claude project documents library for Claude API Exporter 4.1+
// @author       MRL
// @match        https://claude.ai/*
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // =============================================
    // DEPENDENCY CHECK AND UTILITIES
    // =============================================

    function checkDependency() {
        const mainScript = window.claudeExporter;
        if (typeof mainScript === 'undefined') {
            console.error('[Claude Project Documents Exporter] Claude API Exporter not found!');
            return false;
        }

        // Initialize utilities after successful dependency check
        initializeUtilities();
        return true;
    }

    // Utilities from main script (initialized after main script loads)
    let showNotification, sanitizeFileName, ArchiveManager, downloadFile;
    let generateTimestamp, loadSettings, getOrgId;

    function initializeUtilities() {
        const mainScript = window.claudeExporter;
        showNotification = mainScript.showNotification;
        sanitizeFileName = mainScript.sanitizeFileName;
        ArchiveManager = mainScript.ArchiveManager;
        downloadFile = mainScript.downloadFile;
        generateTimestamp = mainScript.generateTimestamp;
        loadSettings = mainScript.loadSettings;
        getOrgId = mainScript.getOrgId;
    }

    // =============================================
    // PROJECT DOCUMENTS EXPORT
    // =============================================

    /**
     * Checks if current page is a project page
     */
    function isProjectPage() {
        return window.location.pathname.match(/^\/project\/[^/]+$/);
    }

    /**
     * Gets project ID from current URL
     */
    function getProjectId() {
        const match = window.location.pathname.match(/^\/project\/([^/]+)$/);
        return match ? match[1] : null;
    }

    /**
     * Fetches project information including prompt template
     */
    async function getProjectInfo(projectId) {
        const orgId = getOrgId();
        const response = await fetch(`/api/organizations/${orgId}/projects/${projectId}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch project info: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Fetches project documents
     */
    async function getProjectDocuments(projectId) {
        const orgId = getOrgId();
        const response = await fetch(`/api/organizations/${orgId}/projects/${projectId}/docs`);

        if (!response.ok) {
            throw new Error(`Failed to fetch project documents: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Exports all project documents
     */
    async function exportProjectDocuments() {
        try {
            const projectId = getProjectId();
            if (!projectId) {
                showNotification('❌ Could not determine project ID from URL', 'error');
                return;
            }

            showNotification('Fetching project documents...', 'info');

            // Get project info and documents
            const [projectInfo, documents] = await Promise.all([
                getProjectInfo(projectId),
                getProjectDocuments(projectId)
            ]);

            if (!documents || documents.length === 0) {
                showNotification('No documents found in this project', 'info');
                return;
            }

            const settings = loadSettings();

            // Determine if we should use archive
            const useArchive = settings.exportToArchive;
            let archiveManager = null;
            if (useArchive) {
                archiveManager = new ArchiveManager();
                await archiveManager.initialize();
            }

            let exportedCount = 0;

            // Export prompt template if it exists
            if (projectInfo.prompt_template && projectInfo.prompt_template.trim()) {
                const promptFilename = `${sanitizeFileName(projectInfo.name)}_prompt_template.txt`;
                const promptContent = projectInfo.prompt_template;

                if (archiveManager) {
                    await archiveManager.addFile(promptFilename, promptContent, false, '');
                } else {
                    downloadFile(promptFilename, promptContent);
                }
                exportedCount++;
            }

            // Export each document
            for (const doc of documents) {
                if (doc.file_name && doc.content) {
                    // Use original filename or create one from document info
                    let filename = doc.file_name;

                    // Ensure the filename is safe
                    filename = sanitizeFileName(filename);

                    // If no extension, try to detect from content or add .txt
                    if (!filename.includes('.')) {
                        filename += '.txt';
                    }

                    const content = doc.content;

                    if (archiveManager) {
                        await archiveManager.addFile(filename, content, false, '');
                    } else {
                        downloadFile(filename, content);
                    }
                    exportedCount++;
                }
            }

            // Download archive if created
            if (archiveManager && archiveManager.fileCount > 0) {
                const timestamp = generateTimestamp(new Date());
                const archiveName = `${sanitizeFileName(projectInfo.name)}_Documents_${timestamp}.zip`;
                await archiveManager.downloadArchive(archiveName);
                showNotification(`✅ Exported ${exportedCount} documents to archive: ${archiveName}`, 'success');
            } else if (exportedCount > 0) {
                showNotification(`✅ Exported ${exportedCount} project documents`, 'success');
            } else {
                showNotification('❌ No documents to export', 'error');
            }

        } catch (error) {
            console.error('[Claude Project Documents Exporter] Export failed:', error);
            showNotification(`❌ Project documents export failed: ${error.message}`, 'error');
        }
    }

    // =============================================
    // UI BUTTON INJECTION
    // =============================================

    /**
     * Creates export button element
     */
    function createExportButton() {
        const button = document.createElement('button');
        button.className = `inline-flex
          items-center
          justify-center
          relative
          shrink-0
          can-focus
          select-none
          disabled:pointer-events-none
          disabled:opacity-50
          disabled:shadow-none
          disabled:drop-shadow-none h-8 w-8 rounded-md active:scale-95 bg-inherit border-0.5 hover:bg-bg-300/70 border-border-300 transition rounded-lg scale-100`;
        button.type = 'button';
        button.title = 'Export Project Documents';
        button.style.marginLeft = '8px';
        
        // Export icon (download)
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M224,152v56a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V152a8,8,0,0,1,16,0v56H208V152a8,8,0,0,1,16,0ZM101.66,141.66,120,160V48a8,8,0,0,1,16,0V160l18.34-18.34a8,8,0,0,1,11.32,11.32l-32,32a8,8,0,0,1-11.32,0l-32-32a8,8,0,0,1,11.32-11.32Z"></path></svg>`;
        
        button.addEventListener('click', exportProjectDocuments);
        return button;
    }

    /**
     * Injects export button into project page UI
     */
    function injectExportButton() {
        if (!isProjectPage()) return;

        // Remove existing button if present
        const existingButton = document.getElementById('claude-project-export-btn');
        if (existingButton) {
            existingButton.remove();
        }

        // Find the upload button container
        const uploadContainer = document.querySelector('[data-testid="project-doc-uploader-dropdown-trigger"]')?.parentElement;
        if (!uploadContainer) {
            console.log('[Claude Project Documents Exporter] Upload container not found, retrying...');
            return false;
        }

        // Create and inject export button
        const exportButton = createExportButton();
        exportButton.id = 'claude-project-export-btn';
        
        // Insert after the upload button
        uploadContainer.appendChild(exportButton);
        
        console.log('[Claude Project Documents Exporter] Export button injected successfully');
        return true;
    }

    // =============================================
    // INITIALIZATION
    // =============================================

    async function waitForMainScript() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 100; // Увеличиваем количество попыток

            const checkInterval = setInterval(() => {
                attempts++;
                if (typeof window.claudeExporter !== 'undefined') {
                    console.log(`[Claude Project Documents Exporter] Main script found after ${attempts} attempts`);
                    clearInterval(checkInterval);
                    resolve(true);
                }

                if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 100);
        });
    }

    async function waitForUI() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 50;

            const checkInterval = setInterval(() => {
                attempts++;
                if (injectExportButton()) {
                    clearInterval(checkInterval);
                    resolve(true);
                }

                if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 200);
        });
    }

    async function init() {
        console.log('[Claude Project Documents Exporter] Initializing...');

        const mainScriptLoaded = await waitForMainScript();

        if (!mainScriptLoaded) {
            console.error('[Claude Project Documents Exporter] Main script not detected after 10 seconds');
            showNotification = (msg, type) => {
                console.log(`[${type.toUpperCase()}] ${msg}`);
                alert(`${msg}`);
            };
            // Продолжаем работу без основного скрипта, но с ограниченной функциональностью
        } else {
            if (!checkDependency()) return;
            console.log('[Claude Project Documents Exporter] Main script detected, starting initialization...');
        }

        // Try to inject UI button on project pages
        if (isProjectPage()) {
            await waitForUI();
        }

        // Set up URL change detection
        let lastUrl = window.location.href;
        setInterval(() => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                
                // Re-inject button on project pages
                if (isProjectPage()) {
                    setTimeout(() => {
                        waitForUI();
                    }, 1000); // Wait for page to load
                }
            }
        }, 1000);

        console.log('[Claude Project Documents Exporter] Project documents export functionality activated!');
    }

    // =============================================
    // FALLBACK FUNCTIONS (если основной скрипт не загружен)
    // =============================================

    function fallbackShowNotification(message, type = "info") {
        console.log(`[${type.toUpperCase()}] ${message}`);
        const colors = {
            error: '#f44336',
            success: '#4CAF50',
            info: '#2196F3'
        };

        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            z-index: 10000;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            background-color: ${colors[type] || colors.info};
        `;

        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    function fallbackSanitizeFileName(name) {
        return name.replace(/[\\/:*?"<>|]/g, '_')
                  .replace(/\s+/g, '_')
                  .replace(/__+/g, '_')
                  .replace(/^_+|_+$/g, '')
                  .slice(0, 100);
    }

    function fallbackDownloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 100);
    }

    function fallbackGetOrgId() {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'lastActiveOrg') {
                return value;
            }
        }
        throw new Error('Could not find organization ID');
    }

    // Устанавливаем fallback функции
    if (typeof window.claudeExporter === 'undefined') {
        showNotification = fallbackShowNotification;
        sanitizeFileName = fallbackSanitizeFileName;
        downloadFile = fallbackDownloadFile;
        getOrgId = fallbackGetOrgId;
        generateTimestamp = () => {
            const now = new Date();
            return now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
        };
        loadSettings = () => ({
            exportToArchive: false // fallback setting
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
