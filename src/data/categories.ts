import type { CategoryKey } from "../types";

export const categories: Record<CategoryKey, { name: string; color: string }> = {
  work: { name: "工作", color: "#e27963" },
  life: { name: "生活", color: "#5f8f77" },
  study: { name: "学习", color: "#6e78a8" },
  personal: { name: "个人", color: "#c19552" },
};
