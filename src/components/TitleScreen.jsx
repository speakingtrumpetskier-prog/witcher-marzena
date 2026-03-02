import { useState, useEffect } from "react";
import { COLORS } from "../constants/colors";

export default function TitleScreen({ onBegin }) {
  const [showQuote, setShowQuote] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowQuote(true), 1200);
    const t2 = setTimeout(() => setShowButton(true), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem",
    }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "clamp(2rem, 6vw, 3.5rem)",
          fontWeight: 600,
          color: COLORS.accent,
          letterSpacing: "0.3em",
          animation: "titleReveal 2s ease-out forwards",
          marginBottom: "0.5rem",
          textTransform: "uppercase",
        }}>
          The Witcher
        </h1>
        <div style={{
          width: "40px",
          height: "1px",
          background: COLORS.accentDim,
          margin: "1rem auto",
          opacity: 0.5,
        }} />
        <h2 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "clamp(1.2rem, 3vw, 1.8rem)",
          fontWeight: 400,
          fontStyle: "italic",
          color: COLORS.textDim,
          letterSpacing: "0.15em",
          animation: "subtitleReveal 1.5s ease-out 0.5s forwards",
          opacity: 0,
        }}>
          Marzena
        </h2>
      </div>

      {showQuote && (
        <p style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "clamp(0.9rem, 2vw, 1.1rem)",
          fontStyle: "italic",
          color: COLORS.textDim,
          textAlign: "center",
          maxWidth: "440px",
          lineHeight: 1.8,
          marginTop: "3rem",
          animation: "fadeIn 1.5s ease-out forwards",
          opacity: 0.7,
        }}>
          "There are worse things in the world than monsters.<br />
          Monsters, at least, are honest about what they are."
        </p>
      )}

      {showButton && (
        <button
          onClick={onBegin}
          style={{
            marginTop: "3rem",
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
            animation: "fadeIn 1s ease-out forwards",
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
          Begin
        </button>
      )}
    </div>
  );
}
