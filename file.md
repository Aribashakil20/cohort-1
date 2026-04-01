Current Progress:
- Real-time video capture using OpenCV
- Frame sampling implemented
- Mock AI inference for testing pipeline
Smart Audience Analysis
This script captures real-time video using OpenCV, extracts frames continuously, and processes them at a controlled rate of one frame per second. Currently, we simulate the AI inference using a mock function to validate the pipeline before integrating the actual Vision LLM.

Currently, we are simulating the AI output using random values. In the actual system, these values will come from the Vision LLM analyzing real frames.
So far, we have implemented the input pipeline where we capture real-time video, process frames at a controlled rate, and simulate the AI inference layer. The system currently displays real-time analytics on the video stream, validating our end-to-end pipeline.
We introduced a backend layer that acts as an interface between the video input and the AI processing module, simulating how real-world systems handle requests through APIs.
Input Layer (Camera)
↓
Processing Layer (Frame handling)
↓
Backend Layer (API simulation)
↓
AI Layer (mock + delay)
↓
Output Layer (visual overlay)
We capture real-time video, process frames at a controlled rate, and send them to a backend layer that simulates an API call. This backend forwards the frame to the AI module, which generates audience analytics with simulated latency. The results are then displayed in real time on the video stream.