import importlib
import os
import sys
import unittest


class IndexErrorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ.setdefault("GEMINI_API_KEY", "test-key")
        sys.path.insert(0, os.path.dirname(__file__))
        cls.index = importlib.import_module("index")

    def test_retryable_generation_failures_become_503(self):
        exc = self.index._build_generation_failure_response(
            [
                "[gemini-3-pro-image-preview]: This model is currently experiencing high demand. Please try again later.",
                "[gemini-3.1-flash-image-preview]: Service unavailable",
            ]
        )

        self.assertEqual(exc.status_code, 503)
        self.assertIn("所有模型均未返回有效数据", exc.detail)

    def test_non_retryable_generation_failures_stay_500(self):
        exc = self.index._build_generation_failure_response(
            [
                "[gemini-3-pro-image-preview]: 提示词已触发安全策略被拦截，请尝试修改描述词并重试。",
            ]
        )

        self.assertEqual(exc.status_code, 500)


if __name__ == "__main__":
    unittest.main()
