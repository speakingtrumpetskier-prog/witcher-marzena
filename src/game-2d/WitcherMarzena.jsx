import { useState, useEffect, useRef, useCallback } from "react";
import { COLORS } from "../constants/colors";
import { CLUE_LABELS } from "../data/clues";
import { SCENES } from "../data/scenes";
import TitleScreen from "../components/TitleScreen";
import EndingScreen from "../components/EndingScreen";
import "../styles/game.css";

export default function WitcherMarzena() {
  const [currentScene, setCurrentScene] = useState("title");
  const [flags, setFlags] = useState({});
  const [clues, setClues] = useState([]);
  const [senses, setSenses] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [showChoices, setShowChoices] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const scrollRef = useRef(null);
  const containerRef = useRef(null);

  const scene = SCENES[currentScene];

  // Filter conditional paragraphs
  const getVisibleParagraphs = useCallback(() => {
    if (!scene || !scene.paragraphs) return [];
    return scene.paragraphs.filter(p => {
      if (typeof p === "string") return true;
      if (p.ifFlag && !flags[p.ifFlag]) return false;
      if (p.ifNotFlag && flags[p.ifNotFlag]) return false;
      return true;
    });
  }, [scene, flags]);

  // Filter choices
  const getVisibleChoices = useCallback(() => {
    if (!scene || !scene.choices) return [];
    return scene.choices.filter(c => {
      if (c.hideIfFlag && flags[c.hideIfFlag]) return false;
      if (c.requireFlag && !flags[c.requireFlag]) return false;
      return true;
    });
  }, [scene, flags]);

  // Reveal paragraphs one by one
  useEffect(() => {
    if (currentScene === "title" || !scene || scene.ending) return;
    const paras = getVisibleParagraphs();
    if (revealed < paras.length) {
      const delay = revealed === 0 ? 300 : 700;
      const t = setTimeout(() => setRevealed(r => r + 1), delay);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => setShowChoices(true), 500);
      return () => clearTimeout(t);
    }
  }, [revealed, currentScene, scene, getVisibleParagraphs]);

  // Auto-scroll as paragraphs reveal
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [revealed, senses]);

  // Collect clues on scene enter
  useEffect(() => {
    if (!scene || currentScene === "title") return;
    if (scene.autoClues) {
      setClues(prev => {
        const next = new Set(prev);
        scene.autoClues.forEach(c => next.add(c));
        return Array.from(next);
      });
    }
  }, [currentScene]);

  // Collect senses clues when senses active
  useEffect(() => {
    if (!scene || !senses || !scene.sensesClues) return;
    setClues(prev => {
      const next = new Set(prev);
      scene.sensesClues.forEach(c => next.add(c));
      return Array.from(next);
    });
  }, [senses, currentScene]);

  const handleChoice = useCallback((choice) => {
    if (choice.setFlags) {
      setFlags(prev => {
        const next = { ...prev };
        choice.setFlags.forEach(f => next[f] = true);
        return next;
      });
    }
    if (choice.grantClues) {
      setClues(prev => {
        const next = new Set(prev);
        choice.grantClues.forEach(c => next.add(c));
        return Array.from(next);
      });
    }
    setRevealed(0);
    setShowChoices(false);
    setSenses(false);
    setTimeout(() => {
      setCurrentScene(choice.next);
      if (containerRef.current) {
        containerRef.current.scrollTo({ top: 0, behavior: "auto" });
      }
    }, 100);
  }, []);

  const handleRestart = useCallback(() => {
    setCurrentScene("title");
    setFlags({});
    setClues([]);
    setSenses(false);
    setRevealed(0);
    setShowChoices(false);
    setCodexOpen(false);
  }, []);

  // ── RENDER ──
  if (currentScene === "title") {
    return (
      <div className="witcher-game">
        <TitleScreen onBegin={() => {
          setRevealed(0);
          setShowChoices(false);
          setCurrentScene("approach");
        }} />
      </div>
    );
  }

  if (scene && scene.ending) {
    return (
      <div className="witcher-game">
        <EndingScreen scene={scene} clues={clues} onRestart={handleRestart} />
      </div>
    );
  }

  if (!scene) return null;

  const visibleParas = getVisibleParagraphs();
  const visibleChoices = getVisibleChoices();

  return (
    <div className="witcher-game" ref={containerRef} style={{
      minHeight: "100vh",
      background: COLORS.bg,
      color: COLORS.text,
      overflowY: "auto",
    }}>
      {/* ── HEADER ── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: `linear-gradient(to bottom, ${COLORS.bg} 60%, transparent)`,
        padding: "1rem 1.5rem 2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* Medallion */}
          <div style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: scene.medallion ? COLORS.accent : COLORS.border,
            animation: scene.medallion ? "medallionPulse 3s ease-in-out infinite" : "none",
            boxShadow: scene.medallion ? `0 0 8px ${COLORS.accent}44` : "none",
          }} />
          <div>
            <div className="ui-text" style={{
              fontSize: "0.65rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: COLORS.accentDim,
            }}>{scene.location}</div>
            <div className="ui-text" style={{
              fontSize: "0.6rem",
              color: COLORS.textDim,
              letterSpacing: "0.1em",
            }}>{scene.time}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {/* Codex button */}
          {clues.length > 0 && (
            <button
              className="ui-text"
              onClick={() => setCodexOpen(!codexOpen)}
              style={{
                fontSize: "0.65rem",
                color: codexOpen ? COLORS.accent : COLORS.textDim,
                background: "transparent",
                border: `1px solid ${codexOpen ? COLORS.accentDim : COLORS.border}`,
                padding: "0.35rem 0.75rem",
                cursor: "pointer",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                transition: "all 0.3s ease",
              }}
            >
              Notes ({clues.length})
            </button>
          )}

          {/* Senses toggle */}
          {scene.sensesText && (
            <button
              className="ui-text"
              onClick={() => setSenses(!senses)}
              style={{
                fontSize: "0.65rem",
                color: senses ? COLORS.senses : COLORS.textDim,
                background: senses ? COLORS.senses + "15" : "transparent",
                border: `1px solid ${senses ? COLORS.senses + "66" : COLORS.border}`,
                padding: "0.35rem 0.75rem",
                cursor: "pointer",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                transition: "all 0.3s ease",
              }}
            >
              Senses
            </button>
          )}
        </div>
      </div>

      {/* ── CODEX PANEL ── */}
      {codexOpen && (
        <div style={{
          maxWidth: "640px",
          margin: "0 auto 1.5rem",
          padding: "0 1.5rem",
          animation: "fadeIn 0.3s ease-out forwards",
        }}>
          <div style={{
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            padding: "1.25rem",
            borderRadius: "2px",
          }}>
            <div className="ui-text" style={{
              fontSize: "0.6rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: COLORS.accentDim,
              marginBottom: "1rem",
            }}>Investigation Notes</div>
            {clues.map(c => (
              <div key={c} style={{
                fontSize: "0.85rem",
                color: COLORS.textDim,
                marginBottom: "0.6rem",
                paddingLeft: "0.75rem",
                borderLeft: `2px solid ${COLORS.border}`,
                lineHeight: 1.6,
              }}>
                {CLUE_LABELS[c] || c}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── NARRATIVE ── */}
      <div className="scene-container" key={currentScene} style={{
        maxWidth: "640px",
        margin: "0 auto",
        padding: "0 1.5rem 2rem",
      }}>
        <div style={{ lineHeight: 1.85 }}>
          {visibleParas.slice(0, revealed).map((p, i) => {
            const text = typeof p === "string" ? p : p.text;
            return (
              <p key={`${currentScene}-${i}`} className="paragraph-enter" style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: "clamp(1rem, 2.5vw, 1.15rem)",
                color: COLORS.text,
                marginBottom: "1.25rem",
              }}>{text}</p>
            );
          })}
        </div>

        {/* ── SENSES TEXT ── */}
        {senses && scene.sensesText && revealed >= visibleParas.length && (
          <div className="senses-text" style={{
            marginTop: "1rem",
            marginBottom: "1.5rem",
            padding: "1rem 1.25rem",
            borderLeft: `2px solid ${COLORS.senses}44`,
            background: COLORS.senses + "08",
            animation: "sensesPulse 4s ease-in-out infinite",
          }}>
            <div className="ui-text" style={{
              fontSize: "0.6rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: COLORS.senses,
              marginBottom: "0.6rem",
              opacity: 0.8,
            }}>Witcher Senses</div>
            <p style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: "clamp(0.9rem, 2.2vw, 1.05rem)",
              color: COLORS.senses,
              lineHeight: 1.8,
              opacity: 0.9,
            }}>{scene.sensesText}</p>
          </div>
        )}

        {/* ── CHOICES ── */}
        {showChoices && visibleChoices.length > 0 && (
          <div style={{
            marginTop: "2rem",
            paddingTop: "1.5rem",
            borderTop: `1px solid ${COLORS.border}`,
          }}>
            {visibleChoices.map((choice, i) => (
              <button
                key={i}
                className="choice-enter"
                onClick={() => handleChoice(choice)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: "clamp(0.95rem, 2.3vw, 1.1rem)",
                  color: COLORS.accent,
                  background: COLORS.choiceBg,
                  border: `1px solid ${COLORS.border}`,
                  padding: choice.description ? "1rem 1.25rem" : "0.85rem 1.25rem",
                  marginBottom: "0.6rem",
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                  animationDelay: `${i * 0.12}s`,
                  animationFillMode: "backwards",
                  borderRadius: "2px",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = COLORS.choiceHover;
                  e.currentTarget.style.borderColor = COLORS.accentDim;
                  e.currentTarget.style.paddingLeft = "1.5rem";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = COLORS.choiceBg;
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.paddingLeft = "1.25rem";
                }}
              >
                {choice.text}
                {choice.description && (
                  <span className="ui-text" style={{
                    display: "block",
                    fontSize: "0.7rem",
                    color: COLORS.textDim,
                    marginTop: "0.4rem",
                    lineHeight: 1.5,
                    fontStyle: "normal",
                  }}>{choice.description}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollRef} style={{ height: "4rem" }} />
      </div>

      {/* ── VIGNETTE ── */}
      <div style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        background: `radial-gradient(ellipse at center, transparent 50%, ${COLORS.bg} 100%)`,
        opacity: 0.4,
      }} />
    </div>
  );
}
