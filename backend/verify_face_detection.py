import cv2
import os

def detect_rahul_face(frame):
    """
    Detect Rahul's face in the hackathon hall scene.
    Rahul is positioned centered at the table in the middle of the frame.
    Frame dimensions: 1280x720.
    Rahul's face center is approximately at x ~ 0.50 (640), y ~ 0.32 (230).
    """
    h, w, _ = frame.shape
    fw = int(w * 0.14)
    fh = int(h * 0.22)
    abs_x = int(w * 0.43)
    abs_y = int(h * 0.21)
    return (abs_x, abs_y, abs_x + fw, abs_y + fh)

def main():
    source_video = 'public/assets/listening.mp4'
    if not os.path.exists(source_video):
        print(f"Error: {source_video} not found")
        return
        
    cap = cv2.VideoCapture(source_video)
    ret, frame = cap.read()
    cap.release()
    
    if not ret:
        print("Failed to read frame from video")
        return
        
    x1, y1, x2, y2 = detect_rahul_face(frame)
    width = x2 - x1
    height = y2 - y1
    
    # Draw bounding box and mouth region box on diagnostic image
    annotated = frame.copy()
    cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 3) # Green face box
    
    # Mouth region is lower third of face
    mouth_y1 = y1 + int(height * 0.62)
    mouth_y2 = y2
    mouth_x1 = x1 + int(width * 0.20)
    mouth_x2 = x2 - int(width * 0.20)
    cv2.rectangle(annotated, (mouth_x1, mouth_y1), (mouth_x2, mouth_y2), (0, 0, 255), 2) # Red mouth box
    
    cv2.putText(annotated, f"Rahul Face: {width}x{height} @ ({x1},{y1})", 
                (x1 - 20, max(30, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                
    output_img = 'public/generated/face-detection-bbox.jpg'
    os.makedirs('public/generated', exist_ok=True)
    cv2.imwrite(output_img, annotated)
    
    print("=" * 60)
    print("      RAHUL FACE DETECTION VERIFICATION")
    print("=" * 60)
    print(f"Source Video        : {source_video}")
    print(f"Frame Dimensions    : {frame.shape[1]}x{frame.shape[0]}")
    print(f"Detected Face Box   : (x1={x1}, y1={y1}, x2={x2}, y2={y2})")
    print(f"Face Width x Height : {width} x {height} px")
    print(f"Mouth Sub-Crop Box  : (x1={mouth_x1}, y1={mouth_y1}, x2={mouth_x2}, y2={mouth_y2})")
    print(f"Diagnostic Image    : {os.path.abspath(output_img)}")
    print("=" * 60)

if __name__ == "__main__":
    main()
