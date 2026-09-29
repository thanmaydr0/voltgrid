"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface BentoGridProps {
  className?: string;
  children?: ReactNode;
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export function BentoGrid({ className, children }: BentoGridProps) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={containerVariants}
      initial={reducedMotion ? false : "hidden"}
      whileInView={reducedMotion ? undefined : "visible"}
      viewport={{ once: true, margin: "-50px" }}
      className={cn("grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4", className)}
    >
      {children}
    </motion.div>
  );
}

export default BentoGrid;
