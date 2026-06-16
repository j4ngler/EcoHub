import { serviceUnavailable } from '../../middlewares/error.middleware';

const DEFAULT_CAPTURE_SERVICE_URL = 'http://127.0.0.1:5000';

const getBaseUrl = () => {
  return (process.env.CAPTURE_SERVICE_URL || DEFAULT_CAPTURE_SERVICE_URL).replace(/\/+$/, '');
};

const buildUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getBaseUrl()}${normalizedPath}`;
};

const parseResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
};

export const forwardGet = async (path: string) => {
  try {
    const response = await fetch(buildUrl(path), {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'X-EcoHub-Bridge': '1',
      },
    });

    return {
      ok: response.ok,
      status: response.status,
      data: await parseResponse(response),
    };
  } catch (error) {
    throw serviceUnavailable('Capture service không khả dụng');
  }
};

export const forwardPost = async (path: string, body?: Record<string, unknown>) => {
  try {
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'X-EcoHub-Bridge': '1',
      },
      body: JSON.stringify(body || {}),
    });

    return {
      ok: response.ok,
      status: response.status,
      data: await parseResponse(response),
    };
  } catch (error) {
    throw serviceUnavailable('Capture service không khả dụng');
  }
};

export const forwardFormPost = async (
  path: string,
  body?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
) => {
  try {
    const form = new URLSearchParams();
    Object.entries(body || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.append(key, String(value));
      }
    });

    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'X-EcoHub-Bridge': '1',
        ...(extraHeaders || {}),
      },
      body: form.toString(),
    });

    return {
      ok: response.ok,
      status: response.status,
      data: await parseResponse(response),
    };
  } catch (error) {
    throw serviceUnavailable('Capture service không khả dụng');
  }
};

export const getCaptureServiceInfo = () => {
  return {
    baseUrl: getBaseUrl(),
  };
};

export const isCaptureServiceReachable = async () => {
  try {
    const response = await fetch(buildUrl('/status'), {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'X-EcoHub-Bridge': '1',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
};
