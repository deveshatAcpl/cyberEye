import { Shield, Eye } from "lucide-react";

interface CyberEyeLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function CyberEyeLogo({ size = "md", showText = true }: CyberEyeLogoProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8", 
    lg: "h-12 w-12"
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl"
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Shield className={`${sizeClasses[size]} text-primary drop-shadow-lg`} />
        <Eye className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${
          size === "sm" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-6 w-6"
        } text-foreground`} />
      </div>
      {showText && (
        <span className={`font-bold bg-gradient-primary bg-clip-text text-transparent ${textSizeClasses[size]}`}>
          CyberEye
        </span>
      )}
    </div>
  );
}