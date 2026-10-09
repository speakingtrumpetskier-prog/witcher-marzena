import { useState, useEffect, useRef } from "react";
import { COLORS } from "../constants/colors";
import { CLUE_LABELS } from "../data/clues";

export default function EndingScreen({ scene, clues, onRestart }) {
  const [revealed, setRevealed] = useState(0);
  const [showRestart, setShowRestart] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    setRevealed(0);
    setShowRestart(false);
  }, [scene.endingTitle]);

  useEffect(() => {
    if (revealed < scene.paragraphs.length) {
      const t = setTimeout(() => setRevealed(r => r + 1), 900);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => setShowRestart(true), 1500);
      return () => clearTimeout(t);
    }
  }, [revealed, scene.paragraphs.length]);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [revealed]);

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      padding: "2rem 1rem",
    }}>
      <div style={{
        maxWidth: "640px",
        margin: "0 auto",
      }}>
        <div style={{
          textAlign: "center",
          marginBottom: "3rem",
          paddingTop: "2rem",
          animation: "fadeIn 1s ease-out forwards",
        }}>
          <div style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "0.65rem",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: COLORS.accentDim,
            marginBottom: "0.75rem",
          }}>Epilogue</div>
          <h2 style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(1.4rem, 4vw, 2rem)",
            fontWeight: 600,
            color: COLORS.accent,
            fontStyle: "italic",
          }}>{scene.endingTitle}</h2>
        </div>

        <div style={{ lineHeight: 1.85 }}>
          {scene.paragraphs.slice(0, revealed).map((p, i) => (
            <p key={i} className="paragraph-enter" style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: "clamp(1rem, 2.5vw, 1.15rem)",
              color: COLORS.text,
              marginBottom: "1.25rem",
              animationDelay: "0s",
            }}>{typeof p === "string" ? p : p.text}</p>
          ))}
        </div>

        <div ref={endRef} />

        {showRestart && (
          <div style={{
            textAlign: "center",
            marginTop: "3rem",
            paddingBottom: "3rem",
            animation: "fadeIn 1s ease-out forwards",
          }}>
            <div style={{
              width: "40px",
              height: "1px",
              background: COLORS.accentDim,
              margin: "2rem auto",
              opacity: 0.4,
            }} />

            {clues.length > 0 && (
              <p style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: "0.75rem",
                color: COLORS.textDim,
                marginBottom: "1.5rem",
              }}>
                {clues.length} of {Object.keys(CLUE_LABELS).length} clues discovered
              </p>
            )}

            <button
              onClick={onRestart}
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: "0.8rem",
                fontWeight: 500,
                color: COLORS.accent,
                background: "transparent",
                border: `1px solid ${COLORS.accentDim}`,
                padding: "0.7rem 2.5rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={e => {
                e.target.style.background = COLORS.accentDim + "22";
                e.target.style.borderColor = COLORS.accent;
              }}
              onMouseLeave={e => {
                e.target.style.background = "transparent";
                e.target.style.borderColor = COLORS.accentDim;
              }}
            >
              Begin Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
