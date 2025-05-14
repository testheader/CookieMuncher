import React, { useState, useEffect, useCallback } from 'react';
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@radix-ui/react-tabs';
import { v4 as uuidv4 } from 'uuid';
import {
    Users,
    PlusCircle,
    XCircle,
    KeyRound,
    AlertTriangle,
    CheckCircle,
    Loader2,
    Settings
} from 'lucide-react';
import { cn } from './utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

// Types
interface Session {
    id: string;
    name: string;
    tabId?: number; // Optional, as it might not be immediately available
    cookies: chrome.cookies.Cookie[]; // Store cookies associated with this session
}

// Constants
const MAX_SESSION_NAME_LENGTH = 20;

// Helper Functions
const truncateString = (str: string, length: number) => {
    if (str.length > length) {
        return str.substring(0, length) + '...';
    }
    return str;
};

// Animation Variants
const sessionItemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.2 } },
    exit: { opacity: 0, x: 20, transition: { duration: 0.15 } }
};

const CookieMuncher = () => {
    // State
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [newSessionName, setNewSessionName] = useState('');
    const [loading, setLoading] = useState(true); // Initial loading state
    const [error, setError] = useState<string | null>(null);

    // --- Session Management ---

    /**
     * Creates a new session and opens a new tab for it.
     */
    const createSession = useCallback(async (name: string) => {
        if (!name.trim()) {
            setError('Session name cannot be empty.');
            return;
        }
        if (sessions.some(session => session.name === name.trim())) {
            setError('A session with this name already exists.');
            return;
        }
        if (name.length > MAX_SESSION_NAME_LENGTH) {
            setError(`Session name cannot be longer than ${MAX_SESSION_NAME_LENGTH} characters.`);
            return;
        }

        const newSession: Session = {
            id: uuidv4(),
            name: name.trim(),
            cookies: []
        };

        setSessions(prevSessions => [...prevSessions, newSession]);
        setActiveSessionId(newSession.id);  // Switch to the new session.

        // Open a new tab and associate it with the session.
        try {
            const tab = await chrome.tabs.create({});
            // Store the tab ID with the session.
            setSessions(prevSessions =>
                prevSessions.map(session =>
                    session.id === newSession.id ? { ...session, tabId: tab.id } : session
                )
            );
        } catch (err) {
            console.error("Error creating tab:", err);
            setError('Failed to create new tab.');
            // Optionally, remove the session if tab creation fails.
            setSessions(prevSessions => prevSessions.filter(s => s.id !== newSession.id));
            setActiveSessionId(null);
        }
        setNewSessionName(''); // Clear input after creating
        setError(null);
    }, [sessions]);

    /**
    * code change.
    */

    /**
    * Deletes a session and closes its associated tab.
    */
    const deleteSession = useCallback(async (id: string) => {
        const sessionToDelete = sessions.find(session => session.id === id);

        if (sessionToDelete) {
            // If the session has an associated tab, close it.
            if (sessionToDelete.tabId) {
                try {
                    await chrome.tabs.remove(sessionToDelete.tabId);
                } catch (error) {
                    console.error("Error closing tab:", error);
                    // Optionally, handle the error (e.g., show a message to the user).
                }
            }

            // Remove cookies associated with the session.
            try {
                const cookiesToDelete = sessionToDelete.cookies;
                for (const cookie of cookiesToDelete) {
                    const url = `${cookie.secure ? 'https://' : 'http://'}${cookie.domain}${cookie.path}`;
                    await chrome.cookies.remove({ url, name: cookie.name });
                }
            } catch (error) {
                console.error("Error removing cookies:", error);
                setError("Failed to remove session cookies.  Please check the console.");
            }

            // Remove the session from the state.
            setSessions(prevSessions => prevSessions.filter(session => session.id !== id));
            // If the active session is deleted, switch to another or clear.
            if (activeSessionId === id) {
                setActiveSessionId(sessions.length > 1 ? sessions[0].id : null);
            }
        }
    }, [sessions, activeSessionId]);

    /**
     * Switches to a different session by ID.
     */
    const switchSession = useCallback((id: string) => {
        setActiveSessionId(id);
    }, []);

    /**
     * Handles the logic for isolating cookies for a given tab and session.
     */
    const handleCookieManagement = useCallback(async (tabId: number, sessionId: string) => {
        try {
            const session = sessions.find(s => s.id === sessionId);
            if (!session) return;

            // Get all cookies for the current tab's URL.
            const tab = await chrome.tabs.get(tabId);
            if (!tab || !tab.url) return;
            const url = new URL(tab.url);

            const currentCookies = await chrome.cookies.getAll({ url: url.href });

            // **FIX: Store the retrieved cookies in the session's cookies array.**
            setSessions(prevSessions =>
                prevSessions.map(s =>
                    s.id === sessionId ? { ...s, cookies: currentCookies } : s
                )
            );

            // Remove cookies that do not belong to the current session.
            const sessionCookieNames = session.cookies.map(c => c.name);
            for (const cookie of currentCookies) {
                if (!sessionCookieNames.includes(cookie.name)) {
                    await chrome.cookies.remove({ url: url.href, name: cookie.name });
                }
            }

            // Set cookies for the current session.
            for (const cookie of session.cookies) {
                const cookieDetails: chrome.cookies.SetProperties = {
                    url: url.href,
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    sameSite: cookie.sameSite as chrome.cookies.SameSiteStatus,
                };
                if (cookie.expirationDate) {
                    cookieDetails.expirationDate = cookie.expirationDate;
                }
                await chrome.cookies.set(cookieDetails);
            }
        } catch (error) {
            console.error("Error managing cookies:", error);
            setError("Error managing cookies. Please check console.");
        }
    }, [sessions]);

    // --- Effects ---

    // Load sessions from storage on startup.
    useEffect(() => {
        const loadSessions = async () => {
            try {
                const result = await chrome.storage.local.get({ sessions: [] });
                if (result.sessions && Array.isArray(result.sessions)) {
                    // Basic validation of stored session data
                    const validatedSessions = result.sessions.filter((s: any) =>
                        s && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.cookies)
                    );
                    setSessions(validatedSessions);
                    if (validatedSessions.length > 0) {
                        setActiveSessionId(validatedSessions[0].id); // Set the first session as active.
                    }
                }
            } catch (error) {
                console.error("Error loading sessions:", error);
                setError("Failed to load sessions. Please check console.");
            } finally {
                setLoading(false);
            }
        };
        loadSessions();
    }, []);

    // Save sessions to storage whenever they change.
    useEffect(() => {
        if (!loading) { // Don't save initial empty state.
            const saveSessions = async () => {
                try {
                    await chrome.storage.local.set({ sessions });
                } catch (error) {
                    console.error("Error saving sessions:", error);
                    setError("Failed to save sessions. Please check console.");
                }
            };
            saveSessions();
        }
    }, [sessions, loading]);

    // Listen for tab activation events to apply cookie isolation
    useEffect(() => {
        const handleTabActivated = async (activeInfo: chrome.tabs.TabActiveInfo) => {
            if (activeSessionId) {
                handleCookieManagement(activeInfo.tabId, activeSessionId);
            }
        };

        const handleTabUpdated = async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (changeInfo.status === 'complete') {
            if (activeSessionId) {
                handleCookieManagement(tabId, activeSessionId);
            }
          }
        };

        chrome.tabs.onActivated.addListener(handleTabActivated);
        chrome.tabs.onUpdated.addListener(handleTabUpdated);

        return () => {
            chrome.tabs.onActivated.removeListener(handleTabActivated);
            chrome.tabs.onUpdated.removeListener(handleTabUpdated);
        };
    }, [activeSessionId, handleCookieManagement]);

    // Update tabId when a new tab is created and associated with a session.
    useEffect(() => {
        const handleTabCreated = (tab: chrome.tabs.Tab) => {
            if (activeSessionId) {
                const session = sessions.find(s => s.id === activeSessionId);
                if (session && !session.tabId) { // Check if tabId is already set
                    setSessions(prevSessions =>
                        prevSessions.map(s =>
                            s.id === activeSessionId ? { ...s, tabId: tab.id } : s
                        )
                    );
                }
            }
        };

        chrome.tabs.onCreated.addListener(handleTabCreated);

        return () => {
            chrome.tabs.onCreated.removeListener(handleTabCreated);
        };
    }, [activeSessionId, sessions]);

    // Handle cookie changes and update the session's cookie list.
    useEffect(() => {
        const handleCookieChanged = (changeInfo: chrome.cookies.OnChangedInfo) => {
            if (changeInfo.removed) {
                // Remove the cookie from the relevant session.
                setSessions(prevSessions =>
                    prevSessions.map(session => {
                        if (activeSessionId) {
                            return {
                                ...session,
                                cookies: session.cookies.filter(c => c.name !== changeInfo.cookie.name)
                            };
                        }
                        return session;
                    })
                );
            } else {
                // Add or update the cookie in the relevant session.

                setSessions(prevSessions =>
                    prevSessions.map(session => {
                        if (activeSessionId) {
                            // Check if the cookie already exists in the session
                            const existingCookieIndex = session.cookies.findIndex(c => c.name === changeInfo.cookie.name);
                            if (existingCookieIndex > -1) {
                                // Update existing cookie
                                const updatedCookies = [...session.cookies];
                                updatedCookies[existingCookieIndex] = changeInfo.cookie;
                                return { ...session, cookies: updatedCookies };
                            } else {
                                // Add new cookie
                                return { ...session, cookies: [...session.cookies, changeInfo.cookie] };
                            }
                        }
                        return session;
                    })
                );
            }
        };

        chrome.cookies.onChanged.addListener(handleCookieChanged);

        return () => {
            chrome.cookies.onChanged.removeListener(handleCookieChanged);
        };
    }, [activeSessionId]);

    // --- UI ---

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="animate-spin text-gray-500 w-8 h-8" />
                <span className="ml-2 text-gray-500">Loading sessions...</span>
            </div>
        );
    }

    return (
        <div className="min-h-[200px] w-[350px] p-4 bg-background">
            <Tabs defaultValue="sessions" className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="sessions" className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Sessions
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Settings
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="sessions">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Input
                                type="text"
                                placeholder="Session Name"
                                value={newSessionName}
                                onChange={(e) => setNewSessionName(e.target.value)}
                                className="flex-1"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        createSession(newSessionName);
                                    }
                                }}
                            />
                            <Button
                                onClick={() => createSession(newSessionName)}
                                className="whitespace-nowrap"
                                disabled={!newSessionName.trim()}
                            >
                                <PlusCircle className="mr-2 h-4 w-4" />
                                New Session
                            </Button>
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 text-red-500">
                                <AlertTriangle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        {sessions.length === 0 && !error && (
                            <div className="text-gray-500 text-sm">
                                No sessions created yet.  Click &quot;New Session&quot; to get started.
                            </div>
                        )}

                        <div className="space-y-2">
                            <AnimatePresence>
                                {sessions.map((session) => (
                                    <motion.div
                                        key={session.id}
                                        variants={sessionItemVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                        className={cn(
                                            "flex items-center justify-between p-2 rounded-md transition-colors",
                                            "border",
                                            activeSessionId === session.id
                                                ? "bg-blue-500/20 border-blue-500/50 text-blue-100"
                                                : "hover:bg-gray-100/50 border-gray-700/50 text-gray-300"
                                        )}
                                        onClick={() => switchSession(session.id)}
                                    >
                                        <div className="flex items-center gap-2">
                                            {activeSessionId === session.id && (
                                                <CheckCircle className="w-4 h-4 text-green-400" />
                                            )}
                                            <span className="truncate">
                                                {truncateString(session.name, MAX_SESSION_NAME_LENGTH)}
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent session switch
                                                deleteSession(session.id);
                                            }}
                                            className={cn(
                                                "text-gray-400 hover:text-red-500",
                                                activeSessionId === session.id && "text-red-500" // Keep red when active
                                            )}
                                        >
                                            <XCircle className="h-4 w-4" />
                                        </Button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="settings">
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-200">Cookie Muncher Settings</h3>
                        <p className="text-sm text-gray-400">
                            Manage extension settings.  More options will be added in future releases.
                        </p>
                        <div className="border rounded-md p-4 bg-gray-900/50 border-gray-700/50">
                            <h4 className="text-md font-medium text-gray-200 mb-2">Active Session</h4>
                            {activeSessionId ? (
                                <div className="text-sm text-gray-300">
                                    Currently active session: &quot;
                                    {sessions.find(s => s.id === activeSessionId)?.name || 'Unknown'}
                                    &quot;
                                </div>
                            ) : (
                                <div className="text-sm text-gray-400">No active session.</div>
                            )}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default CookieMuncher;
