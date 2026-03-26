import cv2
import time
import random

cap = cv2.VideoCapture(0)

last_time = 0
frame_count = 0
is_processing = False

def process_frame(frame):
    time.sleep(0.5)  # simulate AI delay
    viewer_count = random.randint(1, 5)
    male = random.randint(0, viewer_count)
    female = viewer_count - male

    return {
        "viewer_count": viewer_count,
        "male": male,
        "female": female,
        "engagement": random.randint(0, 100)
    }

def backend_api(frame):
    result = process_frame(frame)
    return result

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (640, 480))
    frame_count += 1

    current_time = time.time()

    # ✅ FIX 1: this must be INSIDE the loop
    if current_time - last_time >= 1:
        is_processing = True
        data = backend_api(frame)
        is_processing = False
        last_time = current_time

    # ✅ FIX 2: display logic also inside loop and properly indented
    if 'data' in locals():

        # show processing text
        if is_processing:
            cv2.putText(frame, "Processing...",
                        (10, 220), cv2.FONT_HERSHEY_SIMPLEX,
                        1, (0, 255, 255), 2)

        cv2.putText(frame, f"Viewers: {data['viewer_count']}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX,
                    1, (0, 255, 0), 2)

        cv2.putText(frame, f"Male: {data['male']}",
                    (10, 70), cv2.FONT_HERSHEY_SIMPLEX,
                    1, (255, 0, 0), 2)

        cv2.putText(frame, f"Female: {data['female']}",
                    (10, 110), cv2.FONT_HERSHEY_SIMPLEX,
                    1, (0, 0, 255), 2)

        cv2.putText(frame, f"Engagement: {data['engagement']}",
                    (10, 150), cv2.FONT_HERSHEY_SIMPLEX,
                    1, (0, 255, 255), 2)

        cv2.putText(frame, f"Frame: {frame_count}",
                    (10, 190), cv2.FONT_HERSHEY_SIMPLEX,
                    1, (255, 255, 255), 2)

    cv2.imshow("Smart Audience Analysis", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()