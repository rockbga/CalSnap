import { useState, useRef, useCallback, useEffect } from "react";

// !! PASTE YOUR GOOGLE OAUTH CLIENT ID BETWEEN THE QUOTES BELOW !!
const CLIENT_ID = "996037648605-gmr9egoq0tsov0bmegl502ghghn9bslc.apps.googleusercontent.com";

const CALENDARS = [
  { id: "primary", name: "Personal", color: "#4285F4" },
  { id: "work", name: "Work", color: "#0F9D58" },
  { id: "family", name: "Family", color: "#F4B400" },
  { id: "other", name: "Other", color: "#DB4437" },
];

const INITIAL_EVENT = {
  title: "", date: "", startTime: "", endTime: "",
  location: "", description: "", calendar: "primary", uncertain: [],
};

async function callClaude(messages, systemPrompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" 
               "x-api-key": "",
               "anthropic-version": "2023-06-01",
             },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "";
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function parseEventJSON(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return null;
}

const IconCamera = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);
const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
);
const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconSpark = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
  </svg>
);
const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconImage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);

export default function App() {
  const [imageMode, setImageMode] = useState("camera");
  const [stage, setStage] = useState("input");
  const [event, setEvent] = useState(INITIAL_EVENT);
  const [isDragging, setIsDragging] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", content: "Hi! Describe an event and I'll set it up — or snap a photo / upload an image above." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Reading your event…");
  const fileRef = useRef();
  const cameraRef = useRef();
  const chatEndRef = useRef();
  const chatInputRef = useRef();

  const TODAY = new Date().toISOString().split("T")[0];

  const SYSTEM_EXTRACT = `You are a calendar event extractor. Extract event details and return ONLY a JSON object:
{"title":"event name","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","location":"or empty string","description":"brief or empty string","uncertain":["list of field names you are not confident about"]}
Today: ${TODAY}. Assume year 2026 if unspecified. If no end time, add 1 hour to start. Return ONLY valid JSON, nothing else.`;

  const SYSTEM_CHAT = `You are a friendly, concise calendar assistant. Help the user add events by gathering: title, date, time, location through natural conversation. Ask one short clarifying question at a time. Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const processImage = async (file) => {
    setStage("loading");
    setLoadingMsg("Analyzing image…");
    try {
      const b64 = await fileToBase64(file);
      const raw = await callClaude([{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
          { type: "text", text: "Extract all calendar event details from this image." }
        ]
      }], SYSTEM_EXTRACT);
      const parsed = parseEventJSON(raw);
      if (parsed) { setEvent({ ...INITIAL_EVENT, ...parsed }); setStage("preview"); }
      else { alert("Couldn't extract details. Try a clearer image."); setStage("input"); }
    } catch { alert("Error processing image."); setStage("input"); }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImage(file);
    e.target.value = "";
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) processImage(file);
  }, []);

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    chatInputRef.current?.focus();
    const newMessages = [...chatMessages, { role: "user", content: userMsg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      const history = newMessages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      const raw = await callClaude(history, SYSTEM_EXTRACT);
      const parsed = parseEventJSON(raw);
      if (parsed?.title) {
        setEvent({ ...INITIAL_EVENT, ...parsed });
        setChatMessages([...newMessages, {
          role: "assistant",
          content: `Got it! **${parsed.title}** on ${parsed.date} at ${parsed.startTime}${parsed.location ? ` · ${parsed.location}` : ""}. Ready to review?`,
          action: "preview"
        }]);
      } else {
        const reply = await callClaude(history, SYSTEM_CHAT);
        setChatMessages([...newMessages, { role: "assistant", content: reply }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Try again?" }]);
    }
    setChatLoading(false);
  };

  // ── Real Google Calendar integration ──────────────────────────────────────
  const handleConfirm = async () => {
    setStage("loading");
    setLoadingMsg("Connecting to Google Calendar…");
    try {
      // Ask Google for an access token (pops up sign-in if needed)
      const token = await new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: "https://www.googleapis.com/auth/calendar.events",
          callback: (response) => {
            if (response.error) reject(response.error);
            else resolve(response.access_token);
          },
        });
        client.requestAccessToken();
      });

      setLoadingMsg("Adding to Google Calendar…");

      const calendarEvent = {
        summary: event.title,
        location: event.location,
        description: event.description,
        start: {
          dateTime: `${event.date}T${event.startTime}:00`,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: `${event.date}T${event.endTime}:00`,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };

      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(calendarEvent),
        }
      );

      if (res.ok) {
        setStage("success");
      } else {
        const err = await res.json();
        alert("Calendar error: " + err.error.message);
        setStage("preview");
      }
    } catch (e) {
      alert("Could not connect to Google Calendar. Please try again.");
      setStage("preview");
    }
  };
  // ──────────────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setStage("input");
    setEvent(INITIAL_EVENT);
    setChatMessages([{ role: "assistant", content: "Hi! Describe an event and I'll set it up — or snap a photo / upload an image above." }]);
  };

  const selectedCal = CALENDARS.find(c => c.id === event.calendar) || CALENDARS[0];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#08080f",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: "#edeaf5",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "0 16px 48px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::placeholder{color:#2e2c40;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:#1f1e30;border-radius:4px;}
        textarea,input,select{outline:none;font-family:inherit;}
        .ifield{background:#0f0e1c;border:1px solid #1c1b2a;border-radius:10px;color:#edeaf5;padding:10px 14px;font-size:14px;width:100%;transition:border-color 0.2s;}
        .ifield:focus{border-color:#7c6af7;}
        .ifield[type=date],.ifield[type=time]{color-scheme:dark;}
        .btn-p{background:linear-gradient(135deg,#7c6af7,#4e7de0);border:none;border-radius:12px;color:white;font-family:inherit;font-size:15px;font-weight:600;padding:14px 26px;cursor:pointer;transition:opacity 0.2s,transform 0.15s;}
        .btn-p:hover{opacity:0.88;transform:translateY(-1px);}
        .btn-p:active{transform:none;}
        .btn-p:disabled{opacity:0.3;cursor:not-allowed;transform:none;}
        .btn-sm{background:linear-gradient(135deg,#7c6af7,#4e7de0);border:none;border-radius:8px;color:white;font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:opacity 0.2s;}
        .btn-sm:hover{opacity:0.85;}
        .btn-ghost{background:none;border:1px solid #1c1b2a;border-radius:9px;color:#55536a;font-family:inherit;font-size:12px;padding:7px 12px;cursor:pointer;transition:all 0.2s;display:inline-flex;align-items:center;gap:5px;}
        .btn-ghost:hover{background:#131220;color:#9896a8;border-color:#2a2838;}
        .ub{display:inline-block;background:#1a1000;border:1px solid #3d2800;color:#c4880a;font-size:9px;font-weight:700;padding:1px 6px;border-radius:20px;margin-left:5px;vertical-align:middle;text-transform:uppercase;letter-spacing:0.05em;}
        .pill{display:flex;background:#0f0e1c;border:1px solid #1c1b2a;border-radius:40px;padding:3px;}
        .popt{background:none;border:none;border-radius:30px;padding:6px 14px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.18s;display:flex;align-items:center;gap:5px;color:#45435a;letter-spacing:0.01em;}
        .popt.on{background:linear-gradient(135deg,#7c6af7,#4e7de0);color:white;}
        .popt:not(.on):hover{color:#9896a8;}
        .cu{background:linear-gradient(135deg,#6555e8,#3e6cd0);border-radius:16px 16px 3px 16px;padding:9px 13px;font-size:13.5px;max-width:76%;align-self:flex-end;line-height:1.55;color:white;}
        .ca{background:#111020;border:1px solid #1c1b2a;border-radius:16px 16px 16px 3px;padding:9px 13px;font-size:13.5px;max-width:84%;align-self:flex-start;line-height:1.55;color:#b8b5cc;}
        .ca strong{color:#a89cf7;}
        .drop-z{border:1.5px dashed #201f30;border-radius:14px;padding:30px 20px;text-align:center;cursor:pointer;background:#090917;transition:all 0.2s;}
        .drop-z:hover,.drop-z.drag{border-color:#7c6af7;background:#0e0d1e;}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pop{0%{transform:scale(0.7);opacity:0;}70%{transform:scale(1.07);}100%{transform:scale(1);opacity:1;}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0.3;}}
        .fu{animation:fadeUp 0.3s ease forwards;}
        .pi{animation:pop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards;}
        .dot{width:6px;height:6px;border-radius:50%;background:#6b5af0;display:inline-block;animation:blink 1.1s ease-in-out infinite;}
        .dot:nth-child(2){animation-delay:0.18s;}.dot:nth-child(3){animation-delay:0.36s;}
      `}</style>

      {/* Header */}
      <div style={{ width: "100%", maxWidth: 500, paddingTop: 34, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #7c6af7, #4e7de0)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 18px #7c6af725",
          }}>
            <IconCalendar />
          </div>
          <div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>CalSnap</h1>
            <p style={{ fontSize: 11.5, color: "#3a3850", marginTop: 2 }}>AI-powered calendar events</p>
          </div>
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: 500,
        background: "#0c0b18",
        border: "1px solid #18172a",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 20px 70px #00000055",
      }}>

        {/* INPUT */}
        {stage === "input" && (
          <div className="fu">
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#35334a", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Add from image
                </span>
                <div className="pill">
                  <button className={`popt ${imageMode === "camera" ? "on" : ""}`} onClick={() => setImageMode("camera")}>
                    <IconCamera /> Camera
                  </button>
                  <button className={`popt ${imageMode === "upload" ? "on" : ""}`} onClick={() => setImageMode("upload")}>
                    <IconUpload /> Upload
                  </button>
                </div>
              </div>

              {imageMode === "camera" && (
                <>
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFileChange} />
                  <div className="drop-z" onClick={() => cameraRef.current?.click()}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
                    <p style={{ color: "#5e5c70", fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>Snap a flyer, invite, or poster</p>
                    <span className="btn-sm"><IconCamera /> Open Camera</span>
                  </div>
                </>
              )}

              {imageMode === "upload" && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
                  <div
                    className={`drop-z ${isDragging ? "drag" : ""}`}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
                    <p style={{ color: "#5e5c70", fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
                      {isDragging ? "Drop it!" : <>Drop a screenshot or image here<br/><span style={{ fontSize: 11.5, color: "#35334a" }}>PNG, JPG, WEBP · or click to browse</span></>}
                    </p>
                    {!isDragging && <span className="btn-sm"><IconImage /> Browse Files</span>}
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 14px" }}>
              <div style={{ flex: 1, height: 1, background: "#18172a" }} />
              <span style={{ fontSize: 10, color: "#2c2a3e", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>or describe it</span>
              <div style={{ flex: 1, height: 1, background: "#18172a" }} />
            </div>

            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ height: 210, overflowY: "auto", display: "flex", flexDirection: "column", gap: 9, marginBottom: 10, paddingRight: 2 }}>
                {chatMessages.map((msg, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                    <div
                      className={msg.role === "user" ? "cu" : "ca"}
                      dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }}
                    />
                    {msg.action === "preview" && (
                      <button className="btn-sm" style={{ marginTop: 8, borderRadius: 10 }} onClick={() => setStage("preview")}>
                        Review & Confirm →
                      </button>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="ca" style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 14px" }}>
                    <span className="dot" /><span className="dot" /><span className="dot" />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  ref={chatInputRef}
                  className="ifield"
                  placeholder="e.g. Team lunch Friday at noon at Café Roma…"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleChatSend()}
                  style={{ flex: 1, fontSize: 13.5 }}
                />
                <button
                  onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{
                    background: "linear-gradient(135deg,#7c6af7,#4e7de0)",
                    border: "none", borderRadius: 10,
                    width: 42, height: 42, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    opacity: chatLoading || !chatInput.trim() ? 0.3 : 1,
                    transition: "opacity 0.2s",
                  }}>
                  <IconSend />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LOADING */}
        {stage === "loading" && (
          <div style={{ padding: "70px 24px", textAlign: "center" }} className="fu">
            <div style={{
              width: 48, height: 48,
              border: "3px solid #18172a", borderTop: "3px solid #7c6af7",
              borderRadius: "50%", margin: "0 auto 18px",
              animation: "spin 0.8s linear infinite",
            }} />
            <p style={{ color: "#6a687a", fontSize: 14 }}>{loadingMsg}</p>
          </div>
        )}

        {/* PREVIEW */}
        {stage === "preview" && (
          <div className="fu">
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #18172a", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: "#18152e", display: "flex", alignItems: "center", justifyContent: "center", color: "#a89cf7", flexShrink: 0 }}>
                <IconSpark />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>Review Event</p>
                <p style={{ fontSize: 11.5, color: "#45435a", marginTop: 1 }}>Edit anything before saving</p>
              </div>
              <button className="btn-ghost" onClick={handleReset}><IconX /> Start over</button>
            </div>

            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 13 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#45435a", letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>
                  Title {event.uncertain?.includes("title") && <span className="ub">check</span>}
                </label>
                <input className="ifield" value={event.title} onChange={e => setEvent(ev => ({ ...ev, title: e.target.value }))} placeholder="Event name" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr", gap: 9 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#45435a", letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>
                    Date {event.uncertain?.includes("date") && <span className="ub">?</span>}
                  </label>
                  <input type="date" className="ifield" style={{ fontSize: 13 }} value={event.date} onChange={e => setEvent(ev => ({ ...ev, date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#45435a", letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Start</label>
                  <input type="time" className="ifield" style={{ fontSize: 13 }} value={event.startTime} onChange={e => setEvent(ev => ({ ...ev, startTime: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#45435a", letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>End</label>
                  <input type="time" className="ifield" style={{ fontSize: 13 }} value={event.endTime} onChange={e => setEvent(ev => ({ ...ev, endTime: e.target.value }))} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#45435a", letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Location</label>
                <input className="ifield" value={event.location} onChange={e => setEvent(ev => ({ ...ev, location: e.target.value }))} placeholder="Add location (optional)" />
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#45435a", letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Notes</label>
                <textarea className="ifield" rows={3} value={event.description} onChange={e => setEvent(ev => ({ ...ev, description: e.target.value }))} placeholder="Add notes (optional)" style={{ resize: "vertical" }} />
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#45435a", letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Calendar</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {CALENDARS.map(cal => (
                    <button key={cal.id} onClick={() => setEvent(ev => ({ ...ev, calendar: cal.id }))} style={{
                      background: event.calendar === cal.id ? cal.color + "18" : "#0c0b18",
                      border: `1px solid ${event.calendar === cal.id ? cal.color + "70" : "#1c1b2a"}`,
                      borderRadius: 20, padding: "6px 13px",
                      color: event.calendar === cal.id ? cal.color : "#55536a",
                      fontSize: 13, fontWeight: 500, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 5,
                      transition: "all 0.15s",
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cal.color }} />
                      {cal.name}
                    </button>
                  ))}
                </div>
              </div>

              {event.uncertain?.length > 0 && (
                <div style={{
                  background: "#120d00", border: "1px solid #352200",
                  borderRadius: 9, padding: "9px 13px",
                  fontSize: 13, color: "#a87a08", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5,
                }}>
                  <span>⚠️</span>
                  <span>Please verify: <strong style={{ color: "#c9940c" }}>{event.uncertain.join(", ")}</strong></span>
                </div>
              )}

              <button className="btn-p" onClick={handleConfirm} disabled={!event.title || !event.date} style={{ width: "100%", marginTop: 2 }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  <IconCalendar /> Add to {selectedCal.name} Calendar
                </span>
              </button>
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {stage === "success" && (
          <div style={{ padding: "58px 24px", textAlign: "center" }} className="fu">
            <div className="pi" style={{
              width: 66, height: 66, borderRadius: "50%",
              background: "linear-gradient(135deg, #0f9d58, #2dd4a0)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px", boxShadow: "0 8px 28px #0f9d5835",
            }}>
              <IconCheck />
            </div>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Added!</h2>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{event.title}</p>
            <p style={{ fontSize: 13, color: "#45435a", marginBottom: 6 }}>{event.date} · {event.startTime}–{event.endTime}</p>
            <div style={{ marginBottom: 30 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: selectedCal.color + "15",
                border: `1px solid ${selectedCal.color}45`,
                color: selectedCal.color,
                borderRadius: 20, padding: "4px 12px",
                fontSize: 13, fontWeight: 500,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: selectedCal.color }} />
                {selectedCal.name}
              </span>
            </div>
            <button className="btn-p" onClick={handleReset}>+ Add Another Event</button>
          </div>
        )}
      </div>

      <p style={{ marginTop: 22, fontSize: 11, color: "#1e1c2e", textAlign: "center" }}>
        Powered by Claude AI · Google Calendar Integration
      </p>
    </div>
  );
}
