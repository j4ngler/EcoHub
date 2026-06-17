type BrowserCameraListener = (stream: MediaStream | null) => void;

let browserCameraStream: MediaStream | null = null;
const listeners = new Set<BrowserCameraListener>();

const notify = () => {
  listeners.forEach((listener) => listener(browserCameraStream));
};

export const getBrowserCameraStream = () => browserCameraStream;

export const isBrowserCameraRunning = () =>
  Boolean(browserCameraStream?.getVideoTracks().some((track) => track.readyState === 'live'));

export const subscribeBrowserCamera = (listener: BrowserCameraListener) => {
  listeners.add(listener);
  listener(browserCameraStream);

  return () => {
    listeners.delete(listener);
  };
};

export const startSharedBrowserCamera = async (constraints: MediaStreamConstraints) => {
  const currentLive = isBrowserCameraRunning();
  if (currentLive && browserCameraStream) {
    notify();
    return browserCameraStream;
  }

  browserCameraStream?.getTracks().forEach((track) => track.stop());
  browserCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
  browserCameraStream.getTracks().forEach((track) => {
    track.addEventListener('ended', () => {
      if (!isBrowserCameraRunning()) {
        browserCameraStream = null;
        notify();
      }
    });
  });
  notify();
  return browserCameraStream;
};

export const stopSharedBrowserCamera = () => {
  browserCameraStream?.getTracks().forEach((track) => track.stop());
  browserCameraStream = null;
  notify();
};
