import { useEffect, useRef } from "react";

export function usePointerTilt(enabled) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return undefined;
    }

    const reset = () => {
      node.style.setProperty("--rotate-x", "0deg");
      node.style.setProperty("--rotate-y", "0deg");
      node.style.setProperty("--pointer-x", "50%");
      node.style.setProperty("--pointer-y", "50%");
    };

    reset();

    if (!enabled) {
      return undefined;
    }

    let frameId = 0;

    const handleMove = (event) => {
      const rect = node.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      const rotateY = (x - 50) / 7;
      const rotateX = (50 - y) / 9;

      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        node.style.setProperty("--rotate-x", `${rotateX.toFixed(2)}deg`);
        node.style.setProperty("--rotate-y", `${rotateY.toFixed(2)}deg`);
        node.style.setProperty("--pointer-x", `${x.toFixed(2)}%`);
        node.style.setProperty("--pointer-y", `${y.toFixed(2)}%`);
      });
    };

    const handleLeave = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(reset);
    };

    node.addEventListener("pointermove", handleMove, { passive: true });
    node.addEventListener("pointerleave", handleLeave);

    return () => {
      cancelAnimationFrame(frameId);
      node.removeEventListener("pointermove", handleMove);
      node.removeEventListener("pointerleave", handleLeave);
      reset();
    };
  }, [enabled]);

  return ref;
}
