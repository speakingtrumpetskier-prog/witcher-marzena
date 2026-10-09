import { useState } from "react";
import WitcherMarzena from "./game-2d/WitcherMarzena";
import WitcherMarzena3D from "./game-3d/WitcherMarzena3D";

const MODES = {
  select: "select",
  text: "text",
  world: "world",
};

export default function App() {
  const [mode, setMode] = useState(MODES.select);

  if (mode === MODES.text) return <WitcherMarzena />;
  if (mode === MODES.world) return <WitcherMarzena3D />;

  // Mode selection screen
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0908",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      padding: "2rem",
    }}>
      <h1 style={{
        fontSize: "clamp(2rem, 6vw, 3.5rem)",
        fontWeight: 600,
        color: "#c9a96e",
        letterSpacing: "0.3em",
        textTransform: "uppercase",
        marginBottom: "0.5rem",
      }}>
        The Witcher
      </h1>
      <div style={{
        width: "40px",
        height: "1px",
        background: "#8b7355",
        margin: "1rem auto",
        opacity: 0.5,
      }} />
      <h2 style={{
        fontSize: "clamp(1.2rem, 3vw, 1.8rem)",
        fontWeight: 400,
        fontStyle: "italic",
        color: "#8a7d6a",
        letterSpacing: "0.15em",
        marginBottom: "3rem",
      }}>
        Marzena
      </h2>

      <p style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: "0.75rem",
        color: "#8a7d6a",
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        marginBottom: "1.5rem",
      }}>
        Choose your experience
      </p>

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => setMode(MODES.text)}
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "1.1rem",
            color: "#c9a96e",
            background: "transparent",
            border: "1px solid #8b7355",
            padding: "1.2rem 2.5rem",
            cursor: "pointer",
            transition: "all 0.3s ease",
            minWidth: "200px",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#8b735522";
            e.currentTarget.style.borderColor = "#c9a96e";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "#8b7355";
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Text Adventure</div>
          <div style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "0.65rem",
            color: "#8a7d6a",
            lineHeight: 1.6,
          }}>
            Rich narrative with witcher senses
          </div>
        </button>

        <button
          onClick={() => setMode(MODES.world)}
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "1.1rem",
            color: "#c9a96e",
            background: "transparent",
            border: "1px solid #8b7355",
            padding: "1.2rem 2.5rem",
            cursor: "pointer",
            transition: "all 0.3s ease",
            minWidth: "200px",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#8b735522";
            e.currentTarget.style.borderColor = "#c9a96e";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "#8b7355";
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>3D World</div>
          <div style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "0.65rem",
            color: "#8a7d6a",
            lineHeight: 1.6,
          }}>
            Explore Marzena in 3D with music
          </div>
        </button>
      </div>
    </div>
  );
}
