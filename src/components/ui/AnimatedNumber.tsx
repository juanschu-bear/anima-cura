"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

interface Props {
  value: number;
  duration?: number;
  formatFn?: (n: number) => string;
  className?: string;
  style?: React.CSSProperties;
}

export default function AnimatedNumber({ value, duration = 2.0, formatFn, className, style }: Props) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        setDisplay(formatFn ? formatFn(Math.round(v)) : Math.round(v).toLocaleString("de-DE"));
      },
    });
    return () => controls.stop();
  }, [value, duration, formatFn, motionValue]);

  return (
    <motion.span
      className={className}
      style={style}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {display}
    </motion.span>
  );
}
