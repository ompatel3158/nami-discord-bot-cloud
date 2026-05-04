import React from "react";
import { motion } from "framer-motion";

export function Reveal({
  as = "div",
  children,
  className = "",
  delay = 0,
  style,
  ...props
}) {
  const MotionTag = motion[as] || motion.div;

  return (
    <MotionTag
      className={className}
      style={style}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ 
        duration: 0.6, 
        delay: delay / 1000, 
        type: "spring", 
        stiffness: 100, 
        damping: 20 
      }}
      {...props}
    >
      {children}
    </MotionTag>
  );
}
