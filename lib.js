// ==UserScript==
// @name         Claude Mass Exporter Library
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Mass export library for Claude API Exporter
// @author       MRL
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // =============================================
    // DEPENDENCY CHECK
    // =============================================

    function checkDependency() {
        const mainScript = window.claudeExporter || window.claudeExporter || globalThis.claudeExporter;
        if (typeof mainScript === 'undefined') {
            console.error('[Claude Mass Exporter] Claude API Exporter 2.0+ not found! Please install it first.');
            showNotification('⚠️ Claude API Exporter 2.0+ required! Please install the main script first.', 'error');
            return false;
        }
        return true;
    }

    // =============================================
    // UTILITY FUNCTIONS
    // =============================================

    function showNotification(message, type = "info") {
        const notification = document.createElement('div');
        const colors = {
            error: '#f44336',
            success: '#4CAF50',
            info: '#2196F3',
            warning: '#ff9800'
        };
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            z-index: 10001;
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
        }, 8000);
    }

    function getOrgId() {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'lastActiveOrg') {
                return value;
            }
        }
        throw new Error('Could not find organization ID');
    }

    function sanitizeFileName(name) {
        return name.replace(/[\\/:*?"<>|]/g, '_')
                  .replace(/\s+/g, '_')
                  .replace(/__+/g, '_')
                  .replace(/^_+|_+$/g, '')
                  .slice(0, 100);
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // =============================================
    // CONTEXT DETECTION
    // =============================================

    function getCurrentContext() {
        const path = window.location.pathname;
        
        if (path === '/projects') {
            return { type: 'projects', title: 'All Projects' };
        } else if (path.match(/^\/project\/[^/]+$/)) {
            return { type: 'project', title: 'Current Project', projectId: path.split('/')[2] };
        } else if (path === '/recents') {
            return { type: 'recents', title: 'Recent Conversations' };
        } else if (path.match(/^\/chat\/[^/]+$/)) {
            return { type: 'chat', title: 'Current Conversation' };
        }
        
        return { type: 'unknown', title: 'Unknown Context' };
    }

    // =============================================
    // API FUNCTIONS
    // =============================================

    async function getAllProjects() {
        const orgId = getOrgId();
        const response = await fetch(`/api/organizations/${orgId}/projects?include_harmony_projects=true&creator_filter=is_creator`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch projects: ${response.status}`);
        }
        
        return await response.json();
    }

    async function getProjectConversations(projectUuid) {
        const orgId = getOrgId();
        const response = await fetch(`/api/organizations/${orgId}/projects/${projectUuid}/conversations`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch project conversations: ${response.status}`);
        }
        
        return await response.json();
    }

    async function getAllRecentConversations() {
        const orgId = getOrgId();
        const response = await fetch(`/api/organizations/${orgId}/chat_conversations?limit=10000`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch recent conversations: ${response.status}`);
        }
        
        return await response.json();
    }

    async function getConversationData(conversationId) {
        const orgId = getOrgId();
        const response = await fetch(`/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        return await response.json();
    }

    // =============================================
    // SELECTION UI
    // =============================================

    function createSelectionUI(title, items, onExport) {
        document.getElementById('claude-selection-ui')?.remove();

        const selectionOverlay = document.createElement('div');
        selectionOverlay.id = 'claude-selection-ui';
        
        // Check if items are projects (have uuid and can have chats)
        const isProjectSelection = title.includes('Projects') && items.length > 0 && items[0].uuid;
        
        if (isProjectSelection) {
            // Hierarchical project selection
            selectionOverlay.innerHTML = `
                <div class="claude-selection-overlay">
                    <div class="claude-selection-modal">
                        <div class="claude-selection-header">
                            <h3>📋 ${title}</h3>
                            <button class="claude-selection-close" type="button">×</button>
                        </div>
                        <div class="claude-selection-content">
                            <div class="claude-selection-controls">
                                <button class="claude-btn claude-btn-secondary" type="button" id="selectAllProjects">Select All Projects</button>
                                <button class="claude-btn claude-btn-secondary" type="button" id="selectAllChats">Select All Chats</button>
                                <button class="claude-btn claude-btn-secondary" type="button" id="selectNone">Select None</button>
                                <span class="claude-selection-count">0 chats selected</span>
                            </div>
                            <div class="claude-selection-list" id="selectionList">
                                ${items.map((project, projectIndex) => `
                                    <div class="claude-project-item" data-project-index="${projectIndex}">
                                        <div class="claude-project-header">
                                            <button class="claude-project-toggle" type="button" data-project="${projectIndex}">
                                                <span class="claude-toggle-icon">▶</span>
                                            </button>
                                            <input type="checkbox" id="project-${projectIndex}" class="claude-project-checkbox" data-project="${projectIndex}">
                                            <label for="project-${projectIndex}" class="claude-project-label">
                                                <div class="claude-project-name">📁 ${project.name}</div>
                                                <div class="claude-project-meta">${project.meta || ''} | <span class="chat-count">Click to load chats...</span></div>
                                            </label>
                                        </div>
                                        <div class="claude-project-chats" id="chats-${projectIndex}" style="display: none;">
                                            <div class="claude-loading">Loading conversations...</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="claude-selection-footer">
                            <button class="claude-btn claude-btn-secondary" type="button" id="cancelSelection">Cancel</button>
                            <button class="claude-btn claude-btn-primary" type="button" id="exportSelected" disabled>Export Selected</button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Regular flat selection
            selectionOverlay.innerHTML = `
                <div class="claude-selection-overlay">
                    <div class="claude-selection-modal">
                        <div class="claude-selection-header">
                            <h3>📋 ${title}</h3>
                            <button class="claude-selection-close" type="button">×</button>
                        </div>
                        <div class="claude-selection-content">
                            <div class="claude-selection-controls">
                                <button class="claude-btn claude-btn-secondary" type="button" id="selectAll">Select All</button>
                                <button class="claude-btn claude-btn-secondary" type="button" id="selectNone">Select None</button>
                                <span class="claude-selection-count">0 selected</span>
                            </div>
                            <div class="claude-selection-list" id="selectionList">
                                ${items.map((item, index) => `
                                    <div class="claude-selection-item">
                                        <input type="checkbox" id="item-${index}" value="${index}" class="claude-selection-checkbox">
                                        <label for="item-${index}" class="claude-selection-label">
                                            <div class="claude-selection-name">${item.name}</div>
                                            <div class="claude-selection-meta">${item.meta || ''}</div>
                                        </label>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="claude-selection-footer">
                            <button class="claude-btn claude-btn-secondary" type="button" id="cancelSelection">Cancel</button>
                            <button class="claude-btn claude-btn-primary" type="button" id="exportSelected" disabled>Export Selected</button>
                        </div>
                    </div>
                </div>
            `;
        }

        const styles = `<style id="claude-selection-styles">
            .claude-selection-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:system-ui,-apple-system,sans-serif}
            .claude-selection-modal{background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:90%;max-width:700px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column}
            .claude-selection-header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:20px 24px;display:flex;align-items:center;justify-content:space-between}
            .claude-selection-header h3{margin:0;font-size:18px;font-weight:600}
            .claude-selection-close{background:none;border:none;color:white;font-size:24px;cursor:pointer;padding:0;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:background-color 0.2s}
            .claude-selection-close:hover{background:rgba(255,255,255,0.2)}
            .claude-selection-content{flex:1;overflow-y:auto;padding:24px}
            .claude-selection-controls{display:flex;gap:8px;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}
            .claude-selection-count{margin-left:auto;font-size:14px;color:#718096;font-weight:500}
            .claude-selection-list{display:grid;gap:8px}
            .claude-selection-item{display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;transition:all 0.2s}
            .claude-selection-item:hover{background:#f8fafc;border-color:#667eea}
            .claude-selection-checkbox{margin-top:2px;transform:scale(1.2)}
            .claude-selection-label{flex:1;cursor:pointer;line-height:1.4}
            .claude-selection-name{font-weight:500;color:#2d3748;margin-bottom:4px}
            .claude-selection-meta{font-size:13px;color:#718096}
            
            .claude-project-item{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;transition:all 0.2s}
            .claude-project-item:hover{border-color:#667eea}
            .claude-project-header{display:flex;align-items:center;gap:8px;padding:12px;background:#f8fafc;cursor:pointer}
            .claude-project-toggle{background:none;border:none;color:#718096;cursor:pointer;font-size:12px;padding:4px;border-radius:4px;transition:all 0.2s;min-width:20px}
            .claude-project-toggle:hover{background:#e2e8f0}
            .claude-toggle-icon{transition:transform 0.2s;display:inline-block}
            .claude-toggle-icon.expanded{transform:rotate(90deg)}
            .claude-project-checkbox{transform:scale(1.2)}
            .claude-project-label{flex:1;cursor:pointer;line-height:1.4}
            .claude-project-name{font-weight:600;color:#2d3748;margin-bottom:4px}
            .claude-project-meta{font-size:13px;color:#718096}
            .chat-count{font-weight:500;color:#667eea}
            
            .claude-project-chats{background:#fff;border-top:1px solid #e2e8f0}
            .claude-chat-item{display:flex;align-items:center;gap:12px;padding:8px 16px 8px 48px;transition:all 0.2s;border-bottom:1px solid #f1f5f9}
            .claude-chat-item:last-child{border-bottom:none}
            .claude-chat-item:hover{background:#f8fafc}
            .claude-chat-checkbox{transform:scale(1.1)}
            .claude-chat-label{flex:1;cursor:pointer;line-height:1.3}
            .claude-chat-name{font-weight:500;color:#374151;margin-bottom:2px}
            .claude-chat-meta{font-size:12px;color:#9ca3af}
            .claude-loading{padding:16px;text-align:center;color:#718096;font-style:italic}
            .claude-error{padding:16px;text-align:center;color:#ef4444;font-size:13px}
            
            .claude-btn{padding:8px 16px;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.2s}
            .claude-btn-primary{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white}
            .claude-btn-primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 12px rgba(102,126,234,0.4)}
            .claude-btn-primary:disabled{opacity:0.5;cursor:not-allowed}
            .claude-btn-secondary{background:#e2e8f0;color:#2d3748;font-size:12px;padding:6px 12px}
            .claude-btn-secondary:hover{background:#cbd5e0}
            .claude-selection-footer{background:#f8fafc;padding:20px 24px;border-top:1px solid #e2e8f0;display:flex;gap:12px;justify-content:flex-end}
        </style>`;

        document.head.insertAdjacentHTML('beforeend', styles);
        document.body.appendChild(selectionOverlay);

        if (isProjectSelection) {
            // Project selection logic
            let selectedChats = new Map();
            let projectChats = new Map();
            let loadedProjects = new Set();

            items.forEach((_, index) => {
                selectedChats.set(index, new Set());
            });

            function updateUI() {
                let totalSelectedChats = 0;
                selectedChats.forEach(chatSet => {
                    totalSelectedChats += chatSet.size;
                });
                
                document.querySelector('.claude-selection-count').textContent = `${totalSelectedChats} chats selected`;
                document.getElementById('exportSelected').disabled = totalSelectedChats === 0;
                
                items.forEach((_, projectIndex) => {
                    const projectCheckbox = document.getElementById(`project-${projectIndex}`);
                    const chats = projectChats.get(projectIndex) || [];
                    const selectedChatSet = selectedChats.get(projectIndex);
                    
                    if (chats.length === 0) {
                        // Don't change checkbox if it's currently checked (loading state)
                        if (!projectCheckbox.checked) {
                            projectCheckbox.indeterminate = false;
                        }
                    } else if (selectedChatSet.size === 0) {
                        projectCheckbox.indeterminate = false;
                        projectCheckbox.checked = false;
                    } else if (selectedChatSet.size === chats.length) {
                        projectCheckbox.indeterminate = false;
                        projectCheckbox.checked = true;
                    } else {
                        projectCheckbox.indeterminate = true;
                    }
                });
            }

            async function loadProjectChats(projectIndex) {
                if (loadedProjects.has(projectIndex)) return;
                
                const project = items[projectIndex];
                const chatsContainer = document.getElementById(`chats-${projectIndex}`);
                
                try {
                    const conversations = await getProjectConversations(project.uuid);
                    projectChats.set(projectIndex, conversations);
                    loadedProjects.add(projectIndex);
                    
                    const countElement = document.querySelector(`[data-project-index="${projectIndex}"] .chat-count`);
                    countElement.textContent = `${conversations.length} chats`;
                    
                    chatsContainer.innerHTML = conversations.map((chat, chatIndex) => `
                        <div class="claude-chat-item">
                            <input type="checkbox" id="chat-${projectIndex}-${chatIndex}" class="claude-chat-checkbox" 
                                   data-project="${projectIndex}" data-chat="${chatIndex}">
                            <label for="chat-${projectIndex}-${chatIndex}" class="claude-chat-label">
                                <div class="claude-chat-name">💬 ${chat.name}</div>
                                <div class="claude-chat-meta">Updated: ${new Date(chat.updated_at).toLocaleDateString()}</div>
                            </label>
                        </div>
                    `).join('');
                    
                    chatsContainer.querySelectorAll('.claude-chat-checkbox').forEach(checkbox => {
                        checkbox.addEventListener('change', (e) => {
                            const projectIdx = parseInt(e.target.dataset.project);
                            const chatIdx = parseInt(e.target.dataset.chat);
                            const selectedChatSet = selectedChats.get(projectIdx);
                            
                            if (e.target.checked) {
                                selectedChatSet.add(chatIdx);
                            } else {
                                selectedChatSet.delete(chatIdx);
                            }
                            updateUI();
                        });
                    });
                    
                } catch (error) {
                    console.error(`Failed to load chats for project ${project.name}:`, error);
                    chatsContainer.innerHTML = '<div class="claude-error">❌ Failed to load conversations</div>';
                    
                    const countElement = document.querySelector(`[data-project-index="${projectIndex}"] .chat-count`);
                    countElement.textContent = 'Error loading chats';
                }
            }

            // Project toggle handlers - ONLY on arrow
            document.querySelectorAll('.claude-project-toggle').forEach(element => {
                element.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const projectIndex = parseInt(e.currentTarget.dataset.project);
                    const chatsContainer = document.getElementById(`chats-${projectIndex}`);
                    const toggleIcon = e.currentTarget.querySelector('.claude-toggle-icon');
                    
                    if (chatsContainer.style.display === 'none') {
                        chatsContainer.style.display = 'block';
                        toggleIcon.classList.add('expanded');
                        await loadProjectChats(projectIndex);
                    } else {
                        chatsContainer.style.display = 'none';
                        toggleIcon.classList.remove('expanded');
                    }
                });
            });

            // Project checkbox handlers
            document.querySelectorAll('.claude-project-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', async (e) => {
                    const projectIndex = parseInt(e.target.dataset.project);
                    const selectedChatSet = selectedChats.get(projectIndex);
                    
                    if (e.target.checked) {
                        // If chats not loaded yet, load them first
                        if (!loadedProjects.has(projectIndex)) {
                            e.target.disabled = true;
                            await loadProjectChats(projectIndex);
                            e.target.disabled = false;
                        }
                        
                        const chats = projectChats.get(projectIndex) || [];
                        
                        // Select all chats
                        chats.forEach((_, chatIndex) => {
                            selectedChatSet.add(chatIndex);
                            const chatCheckbox = document.getElementById(`chat-${projectIndex}-${chatIndex}`);
                            if (chatCheckbox) chatCheckbox.checked = true;
                        });
                    } else {
                        // Deselect all chats
                        selectedChatSet.clear();
                        const chats = projectChats.get(projectIndex) || [];
                        chats.forEach((_, chatIndex) => {
                            const chatCheckbox = document.getElementById(`chat-${projectIndex}-${chatIndex}`);
                            if (chatCheckbox) chatCheckbox.checked = false;
                        });
                    }
                    updateUI();
                });
            });

            // Control buttons
            document.getElementById('selectAllProjects').addEventListener('click', async () => {
                for (let projectIndex = 0; projectIndex < items.length; projectIndex++) {
                    if (!loadedProjects.has(projectIndex)) {
                        await loadProjectChats(projectIndex);
                    }
                    
                    const projectCheckbox = document.getElementById(`project-${projectIndex}`);
                    projectCheckbox.checked = true;
                    projectCheckbox.dispatchEvent(new Event('change'));
                }
            });

            document.getElementById('selectAllChats').addEventListener('click', async () => {
                for (let projectIndex = 0; projectIndex < items.length; projectIndex++) {
                    if (!loadedProjects.has(projectIndex)) {
                        await loadProjectChats(projectIndex);
                    }
                    
                    const chats = projectChats.get(projectIndex) || [];
                    const selectedChatSet = selectedChats.get(projectIndex);
                    
                    chats.forEach((_, chatIndex) => {
                        selectedChatSet.add(chatIndex);
                        const chatCheckbox = document.getElementById(`chat-${projectIndex}-${chatIndex}`);
                        if (chatCheckbox) chatCheckbox.checked = true;
                    });
                }
                updateUI();
            });

            document.getElementById('selectNone').addEventListener('click', () => {
                selectedChats.forEach((chatSet, projectIndex) => {
                    chatSet.clear();
                    const projectCheckbox = document.getElementById(`project-${projectIndex}`);
                    projectCheckbox.checked = false;
                    
                    const chats = projectChats.get(projectIndex) || [];
                    chats.forEach((_, chatIndex) => {
                        const chatCheckbox = document.getElementById(`chat-${projectIndex}-${chatIndex}`);
                        if (chatCheckbox) chatCheckbox.checked = false;
                    });
                });
                updateUI();
            });

            // Export handler
            document.getElementById('exportSelected').addEventListener('click', () => {
                const selectedData = [];
                
                selectedChats.forEach((chatSet, projectIndex) => {
                    if (chatSet.size > 0) {
                        const project = items[projectIndex];
                        const chats = projectChats.get(projectIndex) || [];
                        
                        const selectedProjectChats = Array.from(chatSet).map(chatIndex => chats[chatIndex]);
                        
                        selectedData.push({
                            project: project,
                            chats: selectedProjectChats
                        });
                    }
                });
                
                closeModal();
                onExport(selectedData);
            });

            updateUI();

        } else {
            // Regular selection logic
            let selectedItems = new Set();

            function updateUI() {
                const count = selectedItems.size;
                document.querySelector('.claude-selection-count').textContent = `${count} selected`;
                document.getElementById('exportSelected').disabled = count === 0;
            }

            document.querySelectorAll('.claude-selection-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const index = parseInt(e.target.value);
                    if (e.target.checked) {
                        selectedItems.add(index);
                    } else {
                        selectedItems.delete(index);
                    }
                    updateUI();
                });
            });

            document.getElementById('selectAll').addEventListener('click', () => {
                document.querySelectorAll('.claude-selection-checkbox').forEach(checkbox => {
                    checkbox.checked = true;
                    selectedItems.add(parseInt(checkbox.value));
                });
                updateUI();
            });

            document.getElementById('selectNone').addEventListener('click', () => {
                document.querySelectorAll('.claude-selection-checkbox').forEach(checkbox => {
                    checkbox.checked = false;
                });
                selectedItems.clear();
                updateUI();
            });

            document.getElementById('exportSelected').addEventListener('click', () => {
                const selected = Array.from(selectedItems).map(index => items[index]);
                closeModal();
                onExport(selected);
            });

            updateUI();
        }

        // Common close handlers
        const closeModal = () => {
            document.getElementById('claude-selection-ui')?.remove();
            document.getElementById('claude-selection-styles')?.remove();
        };

        document.querySelector('.claude-selection-close').addEventListener('click', closeModal);
        document.getElementById('cancelSelection').addEventListener('click', closeModal);

        document.querySelector('.claude-selection-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('claude-selection-overlay')) closeModal();
        });
    }

    function createProgressUI(title) {
        document.getElementById('claude-mass-export-progress')?.remove();

        const progressOverlay = document.createElement('div');
        progressOverlay.id = 'claude-mass-export-progress';
        progressOverlay.innerHTML = `
            <div class="claude-progress-overlay">
                <div class="claude-progress-modal">
                    <div class="claude-progress-header">
                        <h3>📦 ${title}</h3>
                        <button class="claude-progress-close" type="button">×</button>
                    </div>
                    <div class="claude-progress-content">
                        <div class="claude-progress-bar">
                            <div class="claude-progress-fill" style="width: 0%"></div>
                        </div>
                        <div class="claude-progress-text">Initializing...</div>
                        <div class="claude-progress-details"></div>
                        <button class="claude-progress-cancel" type="button" style="display: none;">Cancel Export</button>
                    </div>
                </div>
            </div>
        `;

        const styles = `<style id="claude-progress-styles">
            .claude-progress-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:system-ui,-apple-system,sans-serif}
            .claude-progress-modal{background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:90%;max-width:500px;overflow:hidden}
            .claude-progress-header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:20px 24px;display:flex;align-items:center;justify-content:space-between}
            .claude-progress-header h3{margin:0;font-size:18px;font-weight:600}
            .claude-progress-close{background:none;border:none;color:white;font-size:24px;cursor:pointer;padding:0;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:background-color 0.2s}
            .claude-progress-close:hover{background:rgba(255,255,255,0.2)}
            .claude-progress-content{padding:24px}
            .claude-progress-bar{width:100%;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin-bottom:16px}
            .claude-progress-fill{height:100%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);transition:width 0.3s ease;border-radius:4px}
            .claude-progress-text{font-size:16px;font-weight:500;color:#2d3748;margin-bottom:8px}
            .claude-progress-details{font-size:14px;color:#718096;line-height:1.5;min-height:20px}
            .claude-progress-cancel{margin-top:16px;padding:10px 20px;background:#f44336;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500}
            .claude-progress-cancel:hover{background:#d32f2f}
        </style>`;

        document.head.insertAdjacentHTML('beforeend', styles);
        document.body.appendChild(progressOverlay);

        let cancelled = false;

        const closeModal = () => {
            cancelled = true;
            document.getElementById('claude-mass-export-progress')?.remove();
            document.getElementById('claude-progress-styles')?.remove();
        };

        document.querySelector('.claude-progress-close').addEventListener('click', closeModal);
        document.querySelector('.claude-progress-cancel').addEventListener('click', closeModal);

        document.querySelector('.claude-progress-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('claude-progress-overlay')) closeModal();
        });

        return {
            updateProgress: (current, total, text, details = '') => {
                if (cancelled) return false;
                
                const percentage = Math.round((current / total) * 100);
                document.querySelector('.claude-progress-fill').style.width = `${percentage}%`;
                document.querySelector('.claude-progress-text').textContent = text;
                document.querySelector('.claude-progress-details').textContent = details;
                
                if (current === total) {
                    setTimeout(closeModal, 2000);
                }
                
                return true;
            },
            isCancelled: () => cancelled,
            close: closeModal
        };
    }

    // =============================================
    // SINGLE CONVERSATION EXPORT
    // =============================================

    async function exportSingleConversation(conversationData, folderPrefix = '', exportMode = 'final') {
        const mainScript = window.claudeExporter || window.claudeExporter || globalThis.claudeExporter;
        if (!mainScript) {
            throw new Error('Main exporter not available');
        }

        // For 'none' mode (conversation only), use simple approach
        if (exportMode === 'none') {
            const conversationMarkdown = mainScript.generateConversationMarkdown(conversationData, 'none', null, null);
            let filename = mainScript.generateConversationFilename(conversationData);
            if (folderPrefix) {
                filename = `${folderPrefix}/${filename}`;
            }
            mainScript.downloadFile(filename, conversationMarkdown);
            return 1;
        }

        // Use main script's export functions
        const { branchArtifacts, branchInfo } = mainScript.extractAllArtifacts(conversationData);
        const settings = mainScript.loadSettings();
        
        let includeMode;
        if (exportMode === 'latest_per_message') {
            includeMode = 'latest_per_message';
        } else if (exportMode === 'final') {
            includeMode = 'final';
        } else {
            includeMode = 'all';
        }

        let conversationMarkdown;
        let shouldExportSeparateFiles = false;

        // Determine behavior based on setting
        switch (settings.artifactExportMode) {
            case 'embed':
                conversationMarkdown = mainScript.generateConversationMarkdown(conversationData, includeMode, branchArtifacts, branchInfo);
                shouldExportSeparateFiles = false;
                break;
            case 'files':
                conversationMarkdown = mainScript.generateConversationMarkdown(conversationData, 'none', branchArtifacts, branchInfo);
                shouldExportSeparateFiles = true;
                break;
            case 'both':
                conversationMarkdown = mainScript.generateConversationMarkdown(conversationData, includeMode, branchArtifacts, branchInfo);
                shouldExportSeparateFiles = true;
                break;
        }
        
        // Generate filename with folder prefix
        let filename = mainScript.generateConversationFilename(conversationData);
        if (folderPrefix) {
            filename = `${folderPrefix}/${filename}`;
        }
        
        // Download conversation file
        mainScript.downloadFile(filename, conversationMarkdown);
        
        let exportedCount = 1; // Conversation file
        
        // Export artifacts if needed
        if (shouldExportSeparateFiles && branchArtifacts.size > 0) {
            // For latest per message mode, build set of latest artifact timestamps
            let latestArtifactTimestamps = new Set();
            if (exportMode === 'latest_per_message') {
                conversationData.chat_messages.forEach(message => {
                    const latestInMessage = new Map();
                    
                    message.content.forEach(content => {
                        if (content.type === 'tool_use' && content.name === 'artifacts' && content.input) {
                            const artifactId = content.input.id;
                            latestInMessage.set(artifactId, content);
                        }
                    });
                    
                    latestInMessage.forEach((content, artifactId) => {
                        if (content.stop_timestamp) {
                            latestArtifactTimestamps.add(content.stop_timestamp);
                        }
                    });
                });
            }

            branchArtifacts.forEach((artifactsMap, branchId) => {
                const branchData = branchInfo.find(b => b.branchId === branchId);
                const branchLabel = branchData ? branchData.branchIndex.toString() : 'unknown';
                const isMain = branchData ? branchData.isMainBranch : false;
                
                artifactsMap.forEach((versions, artifactId) => {
                    let versionsToExport = versions;

                    if (exportMode === 'latest_per_message') {
                        versionsToExport = versions.filter(version => 
                            latestArtifactTimestamps.has(version.content_stop_timestamp)
                        );
                    } else if (exportMode === 'final') {
                        versionsToExport = [versions[versions.length - 1]];
                    }

                    versionsToExport.forEach(version => {
                        if (settings.excludeCanceledArtifacts && version.stop_reason === 'user_canceled') {
                            return;
                        }
                        
                        let artifactFilename = mainScript.generateArtifactFilename(
                            version, 
                            conversationData, 
                            branchLabel, 
                            isMain, 
                            artifactId
                        );
                        
                        if (folderPrefix) {
                            artifactFilename = `${folderPrefix}/${artifactFilename}`;
                        }
                        
                        const metadata = mainScript.formatArtifactMetadata(
                            version, 
                            artifactId, 
                            branchLabel, 
                            isMain
                        );
                        
                        let processedContent = version.fullContent;
                        if (version.finalType === 'text/markdown' && settings.removeDoubleNewlinesFromMarkdown) {
                            processedContent = mainScript.processArtifactContent(
                                version.fullContent, 
                                version.finalType, 
                                true
                            );
                        }
                        
                        const content = metadata ? metadata + '\n' + processedContent : processedContent;
                        mainScript.downloadFile(artifactFilename, content);
                        exportedCount++;
                    });
                });
            });
        }
        
        return exportedCount;
    }

    // =============================================
    // MASS EXPORT FUNCTIONS WITH SELECTION
    // =============================================

    async function exportAllProjects(exportMode = 'final') {
        try {
            showNotification('Fetching projects...', 'info');
            const projects = await getAllProjects();
            
            if (projects.length === 0) {
                showNotification('No projects found to export', 'info');
                return;
            }

            // Show selection UI
            const projectItems = projects.map(project => ({
                ...project,
                name: project.name,
                meta: `Created: ${new Date(project.created_at).toLocaleDateString()}`
            }));

            createSelectionUI('Select Projects to Export', projectItems, async (selectedData) => {
                await performProjectsExport(selectedData, exportMode);
            });

        } catch (error) {
            console.error('Failed to fetch projects:', error);
            showNotification(`❌ Failed to fetch projects: ${error.message}`, 'error');
        }
    }

    async function performProjectsExport(selectedData, exportMode) {
        const progress = createProgressUI(`Mass Export - Selected Projects (${exportMode === 'none' ? 'conversations only' : exportMode})`);
        
        try {
            let totalConversations = 0;
            let currentConversation = 0;
            let totalExported = 0;
            
            // Count total conversations
            if (Array.isArray(selectedData) && selectedData.length > 0 && selectedData[0].chats) {
                // Hierarchical data
                selectedData.forEach(projectData => {
                    totalConversations += projectData.chats.length;
                });
            } else {
                // Flat data - get conversations for each project
                for (let i = 0; i < selectedData.length; i++) {
                    if (progress.isCancelled()) return;
                    
                    const project = selectedData[i];
                    progress.updateProgress(i, selectedData.length, 'Counting conversations...', 
                        `Project: ${project.name}`);
                    
                    try {
                        const conversations = await getProjectConversations(project.uuid);
                        totalConversations += conversations.length;
                    } catch (error) {
                        console.warn(`Failed to fetch conversations for project ${project.name}:`, error);
                    }
                    
                    await delay(100);
                }
            }

            if (totalConversations === 0) {
                showNotification('No conversations found in selected projects', 'info');
                progress.close();
                return;
            }

            // Export conversations
            if (selectedData[0].chats) {
                // Hierarchical export
                for (const projectData of selectedData) {
                    if (progress.isCancelled()) return;
                    
                    const project = projectData.project;
                    const chats = projectData.chats;
                    const folderName = sanitizeFileName(project.name);
                    
                    for (const chat of chats) {
                        if (progress.isCancelled()) return;
                        
                        currentConversation++;
                        
                        progress.updateProgress(currentConversation, totalConversations, 
                            `Exporting conversation ${currentConversation}/${totalConversations}`, 
                            `Project: ${project.name} | Chat: ${chat.name}`);
                        
                        try {
                            const fullConversationData = await getConversationData(chat.uuid);
                            const exportedCount = await exportSingleConversation(fullConversationData, folderName, exportMode);
                            totalExported += exportedCount;
                        } catch (error) {
                            console.warn(`Failed to export conversation ${chat.name}:`, error);
                        }
                        
                        await delay(200);
                    }
                }
            } else {
                // Flat export
                for (let i = 0; i < selectedData.length; i++) {
                    if (progress.isCancelled()) return;
                    
                    const project = selectedData[i];
                    const folderName = sanitizeFileName(project.name);
                    
                    try {
                        const conversations = await getProjectConversations(project.uuid);
                        
                        for (let j = 0; j < conversations.length; j++) {
                            if (progress.isCancelled()) return;
                            
                            const conversation = conversations[j];
                            currentConversation++;
                            
                            progress.updateProgress(currentConversation, totalConversations, 
                                `Exporting conversation ${currentConversation}/${totalConversations}`, 
                                `Project: ${project.name} | Chat: ${conversation.name}`);
                            
                            try {
                                const fullConversationData = await getConversationData(conversation.uuid);
                                const exportedCount = await exportSingleConversation(fullConversationData, folderName, exportMode);
                                totalExported += exportedCount;
                            } catch (error) {
                                console.warn(`Failed to export conversation ${conversation.name}:`, error);
                            }
                            
                            await delay(200);
                        }
                    } catch (error) {
                        console.warn(`Failed to process project ${project.name}:`, error);
                    }
                }
            }

            showNotification(`✅ Mass export completed! Downloaded ${totalExported} files from ${totalConversations} conversations`, 'success');
            
        } catch (error) {
            console.error('Mass export failed:', error);
            showNotification(`❌ Mass export failed: ${error.message}`, 'error');
        }
    }

    async function exportCurrentProject(exportMode = 'final') {
        const context = getCurrentContext();
        if (context.type !== 'project') {
            showNotification('❌ Not in a project page. Please navigate to a project first.', 'error');
            return;
        }

        try {
            showNotification('Fetching project conversations...', 'info');
            const conversations = await getProjectConversations(context.projectId);
            
            if (conversations.length === 0) {
                showNotification('No conversations found in this project', 'info');
                return;
            }

            // Show selection UI
            const conversationItems = conversations.map(conv => ({
                ...conv,
                name: conv.name,
                meta: `Updated: ${new Date(conv.updated_at).toLocaleDateString()}`
            }));

            createSelectionUI('Select Conversations to Export', conversationItems, async (selectedConversations) => {
                await performConversationsExport(selectedConversations, '', exportMode);
            });

        } catch (error) {
            console.error('Failed to fetch conversations:', error);
            showNotification(`❌ Failed to fetch conversations: ${error.message}`, 'error');
        }
    }

    async function performConversationsExport(selectedConversations, folderPrefix, exportMode) {
        const progress = createProgressUI(`Export Selected Conversations (${exportMode === 'none' ? 'conversations only' : exportMode})`);
        
        try {
            let totalExported = 0;

            for (let i = 0; i < selectedConversations.length; i++) {
                if (progress.isCancelled()) return;
                
                const conversation = selectedConversations[i];
                
                progress.updateProgress(i + 1, selectedConversations.length, 
                    `Exporting conversation ${i + 1}/${selectedConversations.length}`, 
                    `Chat: ${conversation.name}`);
                
                try {
                    const fullConversationData = await getConversationData(conversation.uuid);
                    const exportedCount = await exportSingleConversation(fullConversationData, folderPrefix, exportMode);
                    totalExported += exportedCount;
                } catch (error) {
                    console.warn(`Failed to export conversation ${conversation.name}:`, error);
                }
                
                await delay(200);
            }

            showNotification(`✅ Export completed! Downloaded ${totalExported} files from ${selectedConversations.length} conversations`, 'success');
            
        } catch (error) {
            console.error('Export failed:', error);
            showNotification(`❌ Export failed: ${error.message}`, 'error');
        }
    }

    async function exportAllRecentConversations(exportMode = 'final') {
        try {
            showNotification('Fetching recent conversations...', 'info');
            const conversations = await getAllRecentConversations();
            
            if (conversations.length === 0) {
                showNotification('No recent conversations found', 'info');
                return;
            }

            const conversationItems = conversations.map(conv => ({
                ...conv,
                name: conv.name,
                meta: `Updated: ${new Date(conv.updated_at).toLocaleDateString()}${conv.project_uuid ? ` | Project` : ''}`
            }));

            createSelectionUI('Select Recent Conversations to Export', conversationItems, async (selectedConversations) => {
                await performRecentConversationsExport(selectedConversations, exportMode);
            });

        } catch (error) {
            console.error('Failed to fetch conversations:', error);
            showNotification(`❌ Failed to fetch conversations: ${error.message}`, 'error');
        }
    }

    async function performRecentConversationsExport(selectedConversations, exportMode) {
        const progress = createProgressUI(`Export Selected Recent Conversations (${exportMode === 'none' ? 'conversations only' : exportMode})`);
        
        try {
            let totalExported = 0;

            for (let i = 0; i < selectedConversations.length; i++) {
                if (progress.isCancelled()) return;
                
                const conversation = selectedConversations[i];
                
                progress.updateProgress(i + 1, selectedConversations.length, 
                    `Exporting conversation ${i + 1}/${selectedConversations.length}`, 
                    `Chat: ${conversation.name}`);
                
                try {
                    const fullConversationData = await getConversationData(conversation.uuid);
                    
                    let folderName = '';
                    if (fullConversationData.project && fullConversationData.project.name) {
                        folderName = sanitizeFileName(fullConversationData.project.name);
                    }
                    
                    const exportedCount = await exportSingleConversation(fullConversationData, folderName, exportMode);
                    totalExported += exportedCount;
                } catch (error) {
                    console.warn(`Failed to export conversation ${conversation.name}:`, error);
                }
                
                await delay(200);
            }

            showNotification(`✅ Export completed! Downloaded ${totalExported} files from ${selectedConversations.length} conversations`, 'success');
            
        } catch (error) {
            console.error('Export failed:', error);
            showNotification(`❌ Export failed: ${error.message}`, 'error');
        }
    }

    // =============================================
    // WAIT FOR MAIN SCRIPT AND HOOK INTO IT
    // =============================================

    function waitForMainScript() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 50;
            
            const checkInterval = setInterval(() => {
                attempts++;
                console.log(`[Claude Mass Exporter] Looking for main script... attempt ${attempts}`);
                
                const mainScript = window.claudeExporter || window.claudeExporter || globalThis.claudeExporter;
                console.log(`[Claude Mass Exporter] Found script:`, typeof mainScript);
                
                if (typeof mainScript !== 'undefined') {
                    console.log(`[Claude Mass Exporter] Main script found after ${attempts} attempts!`);
                    clearInterval(checkInterval);
                    resolve(true);
                }
                
                if (attempts >= maxAttempts) {
                    console.log(`[Claude Mass Exporter] Giving up after ${attempts} attempts`);
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 100);
        });
    }

    // =============================================
    // INITIALIZATION
    // =============================================

    async function init() {
        console.log('[Claude Mass Exporter] Initializing...');
        
        // Wait for main script to load
        const mainScriptLoaded = await waitForMainScript();
        
        if (!mainScriptLoaded) {
            console.error('[Claude Mass Exporter] Main script not detected after 5 seconds');
            showNotification('⚠️ Claude API Exporter not detected. Please install the main script first.', 'warning');
            return;
        }

        if (!checkDependency()) {
            return;
        }

        console.log('[Claude Mass Exporter] Main script detected, exposing mass export functions...');

        // Expose mass export functions for the main script to use
        window.claudeMassExporter = {
            exportAllProjects,
            exportCurrentProject,
            exportAllRecentConversations,
            version: '2.0'
        };
        
        console.log('[Claude Mass Exporter] Enhanced export functionality activated!');
        console.log('[Claude Mass Exporter] Export behavior:');
        console.log('  • On /chat/xxx → Normal single chat export');
        console.log('  • On /projects → Export all projects + chats');
        console.log('  • On /project/xxx → Export all chats in project');
        console.log('  • On /recents → Export all recent chats');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
