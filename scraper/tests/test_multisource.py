import json
import unittest

from sources.superbid import SoldSource, SuperbidSource, _declared_stages, _float_value
from sources.zuk import ZukSource


class SuperbidSourceTests(unittest.TestCase):
    def test_decimal_formats_are_preserved(self):
        self.assertEqual(_float_value("1.234,56"), 1234.56)
        self.assertEqual(_float_value("105.17"), 105.17)
        self.assertEqual(_float_value(105.17), 105.17)

    def test_three_declared_praças_are_preserved(self):
        description = """
        Lance Inicial na Primeira Praça (avaliação): R$ 900.000,00.
        Lance Inicial na Segunda Praça (80%): R$ 720.000,00.
        Lance Inicial na Terceira Praça (60%): R$ 540.000,00.
        """
        stages = _declared_stages(description)
        self.assertEqual([stage["stage"] for stage in stages], ["first", "second", "third"])
        self.assertEqual([stage["price"] for stage in stages], [900000.0, 720000.0, 540000.0])

    def test_next_payload_and_channels_are_separated(self):
        offers = [
            {
                "id": 10,
                "price": 250000,
                "endDate": "2026-09-01 12:00:00",
                "store": {"name": "Superbid"},
                "product": {
                    "shortDesc": "Apartamento 55,5 m² - São Paulo/SP",
                    "location": {"city": "São Paulo - SP"},
                    "galleryJson": [{"link": "https://img.test/a.jpg"}],
                    "template": {"groups": [{"properties": [
                        {"id": "endereco", "value": "Rua A, Centro, São Paulo"},
                        {"id": "areautil", "value": "55,5"},
                    ]}]},
                },
            },
            {
                "id": 11,
                "price": 300000,
                "store": {"name": "SOLD"},
                "product": {
                    "shortDesc": "Casa em São Paulo/SP",
                    "location": {"city": "São Paulo - SP"},
                },
            },
        ]
        payload = {"props": {"pageProps": {"offersList": {"offers": offers, "total": 2}}}}
        html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script>'
        parsed, total = SuperbidSource._offers_from_html(html)

        self.assertEqual(total, 2)
        self.assertTrue(SuperbidSource()._accept_store(parsed[0]))
        self.assertFalse(SuperbidSource()._accept_store(parsed[1]))
        self.assertFalse(SoldSource()._accept_store(parsed[0]))
        self.assertTrue(SoldSource()._accept_store(parsed[1]))
        prop = SuperbidSource()._normalize_offer(parsed[0])
        self.assertIsNotNone(prop)
        self.assertEqual(prop.area_m2, 55.5)
        self.assertEqual(prop.city, "São Paulo")

    def test_consorcio_is_not_a_property(self):
        offer = {
            "id": 12,
            "price": 10000,
            "store": {"name": "Superbid"},
            "product": {
                "shortDesc": "Cota de consórcio imobiliário",
                "location": {"city": "São Paulo - SP"},
            },
        }
        self.assertIsNone(SuperbidSource()._normalize_offer(offer))


class ZukSourceTests(unittest.TestCase):
    def test_card_is_normalized_for_capital(self):
        markdown = '''
[![Image 1: Apartamento](https://img.test/zuk.jpg)](https://www.portalzuk.com.br/imovel/apartamento-centro-123 "Apartamento | Itaú Unibanco S/A - Rua A, 10 - São Paulo/SP | Desocupado")
* Apartamento
[São Paulo / SP](https://example.test) - Centro
55,50 m²
1º leilão R$ 500.000,00 01/09/2026
2º leilão R$ 300.000,00 08/09/2026
'''
        properties = ZukSource._parse_markdown(markdown)
        self.assertEqual(len(properties), 1)
        self.assertEqual(properties[0].external_id, "apartamento-centro-123")
        self.assertEqual(properties[0].auction_price, 300000.0)
        self.assertEqual(properties[0].seller_id, "itau")
        self.assertFalse(properties[0].is_occupied)
        self.assertEqual([stage["stage"] for stage in properties[0].auction_stages], ["first", "second"])
        self.assertEqual(properties[0].auction_stage, "first")
        self.assertEqual(properties[0].target_stage, "second")

    def test_other_city_is_rejected(self):
        markdown = '''
[![Image 1: Casa](https://img.test/zuk.jpg)](https://www.portalzuk.com.br/imovel/casa-123 "Casa - Campinas/SP")
* Casa
Valor R$ 100.000,00 01/09/2026
'''
        self.assertEqual(ZukSource._parse_markdown(markdown), [])

    def test_reader_uses_non_browser_headers(self):
        source = ZukSource(max_pages=1)
        self.assertIn("r.jina.ai/http://https://", source._reader_url(1))


if __name__ == "__main__":
    unittest.main()
