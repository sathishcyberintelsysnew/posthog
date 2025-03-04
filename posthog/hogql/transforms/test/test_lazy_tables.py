from posthog.hogql.context import HogQLContext
from posthog.hogql.parser import parse_select
from posthog.hogql.printer import print_ast
from posthog.test.base import BaseTest


class TestLazyTables(BaseTest):
    def test_resolve_lazy_tables(self):
        printed = self._print_select("select event, pdi.person_id from events")
        expected = (
            "SELECT event, events__pdi.person_id "
            "FROM events "
            "INNER JOIN "
            "(SELECT argMax(person_distinct_id2.person_id, version) AS person_id, distinct_id "
            "FROM person_distinct_id2 WHERE equals(team_id, 42) GROUP BY distinct_id "
            "HAVING equals(argMax(is_deleted, version), 0)) AS events__pdi "
            "ON equals(events.distinct_id, events__pdi.distinct_id) "
            "WHERE equals(team_id, 42) "
            "LIMIT 65535"
        )
        self.assertEqual(printed, expected)

    def test_resolve_lazy_tables_traversed_fields(self):
        printed = self._print_select("select event, person_id from events")
        expected = (
            "SELECT event, events__pdi.person_id "
            "FROM events "
            "INNER JOIN "
            "(SELECT argMax(person_distinct_id2.person_id, version) AS person_id, distinct_id "
            "FROM person_distinct_id2 WHERE equals(team_id, 42) GROUP BY distinct_id "
            "HAVING equals(argMax(is_deleted, version), 0)) AS events__pdi "
            "ON equals(events.distinct_id, events__pdi.distinct_id) "
            "WHERE equals(team_id, 42) "
            "LIMIT 65535"
        )
        self.assertEqual(printed, expected)

    def test_resolve_lazy_tables_two_levels(self):
        printed = self._print_select("select event, pdi.person.id from events")
        expected = (
            "SELECT event, events__pdi__person.id "
            "FROM events "
            "INNER JOIN (SELECT argMax(person_distinct_id2.person_id, version) AS person_id, distinct_id "
            "FROM person_distinct_id2 WHERE equals(team_id, 42) GROUP BY distinct_id "
            "HAVING equals(argMax(is_deleted, version), 0)) AS events__pdi "
            "ON equals(events.distinct_id, events__pdi.distinct_id) "
            "INNER JOIN (SELECT id FROM person WHERE equals(team_id, 42) GROUP BY id "
            "HAVING equals(argMax(is_deleted, version), 0)) AS events__pdi__person "
            "ON equals(events__pdi.person_id, events__pdi__person.id) "
            "WHERE equals(team_id, 42) "
            "LIMIT 65535"
        )
        self.assertEqual(printed, expected)

    def test_resolve_lazy_tables_two_levels_traversed(self):
        printed = self._print_select("select event, person.id from events")
        expected = (
            "SELECT event, events__pdi__person.id "
            "FROM events "
            "INNER JOIN (SELECT argMax(person_distinct_id2.person_id, version) AS person_id, distinct_id "
            "FROM person_distinct_id2 WHERE equals(team_id, 42) GROUP BY distinct_id "
            "HAVING equals(argMax(is_deleted, version), 0)) AS events__pdi "
            "ON equals(events.distinct_id, events__pdi.distinct_id) "
            "INNER JOIN (SELECT id FROM person WHERE equals(team_id, 42) GROUP BY id "
            "HAVING equals(argMax(is_deleted, version), 0)) AS events__pdi__person "
            "ON equals(events__pdi.person_id, events__pdi__person.id) "
            "WHERE equals(team_id, 42) "
            "LIMIT 65535"
        )
        self.assertEqual(printed, expected)

    def test_resolve_lazy_tables_one_level_properties(self):
        printed = self._print_select("select person.properties.$browser from person_distinct_ids")
        expected = (
            "SELECT person_distinct_ids__person.`properties___$browser` "
            "FROM person_distinct_id2 INNER JOIN "
            "(SELECT argMax(replaceRegexpAll(JSONExtractRaw(properties, %(hogql_val_0)s), '^\"|\"$', ''), version) "
            "AS `properties___$browser`, id FROM person "
            "WHERE equals(team_id, 42) GROUP BY id "
            "HAVING equals(argMax(is_deleted, version), 0)"
            ") AS person_distinct_ids__person ON equals(person_id, person_distinct_ids__person.id) "
            "WHERE equals(team_id, 42) "
            "LIMIT 65535"
        )
        self.assertEqual(printed, expected)

    def test_resolve_lazy_tables_two_levels_properties(self):
        printed = self._print_select("select event, pdi.person.properties.$browser from events")
        expected = (
            "SELECT event, events__pdi__person.`properties___$browser` FROM events INNER JOIN "
            "(SELECT argMax(person_distinct_id2.person_id, version) AS person_id, distinct_id "
            "FROM person_distinct_id2 WHERE equals(team_id, 42) "
            "GROUP BY distinct_id HAVING equals(argMax(is_deleted, version), 0)"
            ") AS events__pdi ON equals(events.distinct_id, events__pdi.distinct_id) INNER JOIN "
            "(SELECT argMax(replaceRegexpAll(JSONExtractRaw(properties, %(hogql_val_0)s), '^\"|\"$', ''), version) "
            "AS `properties___$browser`, id FROM person "
            "WHERE equals(team_id, 42) GROUP BY id HAVING equals(argMax(is_deleted, version), 0)"
            ") AS events__pdi__person ON equals(events__pdi.person_id, events__pdi__person.id) "
            "WHERE equals(team_id, 42) "
            "LIMIT 65535"
        )
        self.assertEqual(printed, expected)

    def test_resolve_lazy_tables_two_levels_properties_duplicate(self):
        printed = self._print_select("select event, person.properties, person.properties.name from events")
        expected = (
            "SELECT event, events__pdi__person.properties, events__pdi__person.properties___name "
            "FROM events INNER JOIN (SELECT argMax(person_distinct_id2.person_id, version) AS person_id, distinct_id "
            "FROM person_distinct_id2 WHERE equals(team_id, 42) GROUP BY distinct_id HAVING equals(argMax(is_deleted, version), 0)"
            ") AS events__pdi ON equals(events.distinct_id, events__pdi.distinct_id) INNER JOIN "
            "(SELECT argMax(person.properties, version) AS properties, "
            "argMax(replaceRegexpAll(JSONExtractRaw(person.properties, %(hogql_val_0)s), '^\"|\"$', ''), version) AS properties___name, "
            "id FROM person WHERE equals(team_id, 42) GROUP BY id HAVING equals(argMax(is_deleted, version), 0)) AS events__pdi__person "
            "ON equals(events__pdi.person_id, events__pdi__person.id) "
            "WHERE equals(team_id, 42) LIMIT 65535"
        )
        self.assertEqual(printed, expected)

    def _print_select(self, select: str):
        expr = parse_select(select)
        return print_ast(expr, HogQLContext(select_team_id=42), "clickhouse")
