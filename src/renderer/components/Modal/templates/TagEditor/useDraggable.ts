import { useState, useRef, useCallback, useEffect } from "react";

interface Position {
    x: number;
    y: number;
}

export function useDraggable(initialPosition: Position = { x: 0, y: 0 }) {
    const [position, setPosition] = useState<Position>(initialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest("button, input, textarea, .opacity-button")) {
            return;
        }
        
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            posX: position.x,
            posY: position.y,
        };
    }, [position]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !dragStartRef.current) return;

        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        setPosition({
            x: dragStartRef.current.posX + deltaX,
            y: dragStartRef.current.posY + deltaY,
        });
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        dragStartRef.current = null;
    }, []);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    return {
        position,
        isDragging,
        handleMouseDown,
    };
}
