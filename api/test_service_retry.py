import importlib
import os
import sys
import unittest
from unittest import mock


class ServiceRetryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ.setdefault("GEMINI_API_KEY", "test-key")
        sys.path.insert(0, os.path.dirname(__file__))
        cls.service = importlib.import_module("service")

    def test_retryable_server_error_eventually_succeeds(self):
        success_response = mock.Mock()
        success_response.status_code = 200
        success_response.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "inlineData": {
                                    "data": "ZmFrZS1pbWFnZQ==",
                                    "mimeType": "image/png",
                                }
                            }
                        ]
                    }
                }
            ]
        }

        busy_response = mock.Mock()
        busy_response.status_code = 503
        busy_response.json.return_value = {
            "error": {
                "message": "This model is currently experiencing high demand. Please try again later."
            }
        }

        with mock.patch.object(
            self.service.http_client,
            "post",
            side_effect=[busy_response, success_response],
        ) as post_mock, mock.patch.object(self.service.time, "sleep") as sleep_mock:
            result = self.service.generate_image_sync(
                prompt="test prompt",
                aspect_ratio="auto",
                resolution="1k",
                model_name="gemini-3-pro-image-preview",
                images=[],
            )

        self.assertEqual(post_mock.call_count, 2)
        sleep_mock.assert_called_once()
        self.assertEqual(result["mime_type"], "image/png")


if __name__ == "__main__":
    unittest.main()
