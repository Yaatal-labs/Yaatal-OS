import unittest

from live.operator_auth import OperatorSessionStore


class OperatorSessionStoreTest(unittest.TestCase):
    def test_control_token_is_exchanged_for_revocable_session(self):
        store = OperatorSessionStore("server-secret")

        issued = store.issue("Bearer server-secret")

        self.assertIsNotNone(issued)
        raw_session, ttl = issued
        self.assertGreaterEqual(ttl, 300)
        self.assertTrue(store.valid(raw_session))
        store.revoke(raw_session)
        self.assertFalse(store.valid(raw_session))

    def test_missing_or_wrong_control_token_fails_closed(self):
        store = OperatorSessionStore("server-secret")
        self.assertIsNone(store.issue(None))
        self.assertIsNone(store.issue("Bearer wrong"))
        self.assertFalse(store.valid("made-up-session"))
        self.assertFalse(OperatorSessionStore("").configured)


if __name__ == "__main__":
    unittest.main()
