# 🌌 Autómata 2D Generativo · Morfismo de Imágenes & Audio FX

Sistema interactivo de arte generativo basado en **autómatas celulares 2D continuos (ecuación de difusión)**, curvas de nivel topológicas y morfismo fluido de imágenes con síntesis y modulación de audio reactivo.

Desarrollado en **JavaScript con p5.js y p5.sound**.

---

## ✨ Características Principales

- **Morfismo Continuo y Orgánico:** Transición biológica entre imágenes guiada por campos de energía celular y deformación vectorial (*Liquid Vector Warp*).
- **Simulación Multicanal RGB:** Procesamiento independiente de canales Rojo, Verde y Azul con buffers `Float32Array` optimizados a **60 FPS fijos**.
- **Ondas Suaves sin Cortes:** Reemplazo del operador clásico `% 256` por plegado senoidal continuo y curvas de interpolación cúbica suave (*Hermite / Smoothstep*).
- **Audio Interactivo FX (Modulación de Pitch & Rate):**
  - Al deslizar el pincel interactivo con el mouse, modula dinámicamente la velocidad (*playback rate*), tono (*pitch*), volumen y paneo estéreo de pistas sonoras.
  - Soporte para lista de reproducción y cambio de canciones al vuelo.
- **Panel Lateral Translúcido (*Glassmorphism*):**
  - Selector de resolución y nitidez (Alta 2px / Ultra 1px / Equilibrado 3px).
  - 4 modos de color: *Color RGB Original*, *Neón / Ciber*, *Magma / Fuego*, *Blanco y Negro Orgánico*.
  - Deslizadores de decaimiento ondulatorio, fluidez líquida, duración de ciclo y volumen.
  - Carga dinámica de imágenes y música (botón selector y *Drag & Drop*).

---

## 🕹️ Controles e Interacción

| Control | Acción |
| :--- | :--- |
| **Clic y arrastrar mouse** | Inyecta energía al autómata celular y modula el tono/pitch del audio en tiempo real. |
| **Eje Vertical (Y)** | Modula la altura tonal del audio (hacia abajo: grave y lento; hacia arriba: agudo y acelerado). |
| **Eje Horizontal (X)** | Paneo estéreo espacial (izquierda / derecha). |
| **Barra Espaciadora** / `⏭ Siguiente` | Salta inmediatamente a la siguiente imagen. |
| **Flechas `←` / `→`** | Navegar entre imágenes anteriores y siguientes. |
| **Tecla `A`** / `🎵 Pista` | Cambiar a la siguiente canción de la lista. |
| **Tecla `C`** / `🎨 Modo` | Alternar entre los 4 esquemas de color y visualización. |
| **Tecla `M`** / `🔊 Audio` | Silenciar / activar el sonido interactivo. |
| **Tecla `P`** / `⏸ Pausar` | Congelar o reanudar la animación celular. |
| **Tecla `H`** / Botón `✕` | Ocultar o mostrar el panel de control lateral para una vista limpia a pantalla completa. |

---

## 🚀 Cómo ejecutar localmente

1. Clona este repositorio o descarga los archivos.
2. Abre la carpeta con un servidor local (por ejemplo, **Live Server** en VS Code).
3. ¡Disfruta de la experiencia interactiva en tu navegador!

---

*Proyecto desarrollado para experimentación en técnicas generativas y arte digital.*
