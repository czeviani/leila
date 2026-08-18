import unittest

from sources.mega_leiloes import MegaLeiloesSource


HTML = """
<div class="summary">Exibindo <b>1 - 24</b> de <b>24</b> itens. Página <b>1</b> de <b>1</b>.</div>
<div class="card open">
  <a class="card-image" data-bg="https://cdn.example/x.jpg"></a>
  <div class="card-bank"><img src="https://cdn.example/leilao-banco-santander.png"></div>
  <div class="card-price">R$ 250.000,00</div>
  <a class="card-title" href="https://www.megaleiloes.com.br/imoveis/apartamentos/sp/santos/apartamento-80-m2-x123">Apartamento 80 m² - Santos - SP</a>
  <div class="card-number">X123</div>
  <a class="card-locality">Santos, SP</a>
  <div class="card-instance-title">Extrajudicial</div>
  <div class="card-instance-info"><div class="instance"><span>1ª Praça: 31/12/2026 às 10:00</span><span class="card-instance-value">R$ 250.000,00</span></div></div>
</div>
<div class="card open">
  <a class="card-title" href="https://www.megaleiloes.com.br/ML999">Evento não é imóvel</a>
  <div class="card-number">ML999</div>
</div>
"""


class MegaSourceTests(unittest.TestCase):
    def test_only_property_cards_are_normalized(self):
        properties, pages = MegaLeiloesSource._parse_page(HTML)
        self.assertEqual(pages, 1)
        self.assertEqual(len(properties), 1)
        prop = properties[0]
        self.assertEqual(prop.external_id, "X123")
        self.assertEqual(prop.seller_id, "santander")
        self.assertEqual(prop.auction_price, 250000.0)
        self.assertEqual(prop.area_m2, 80.0)
        self.assertEqual(prop.state, "SP")
        self.assertEqual(prop.auction_date.isoformat(), "2026-12-31")
        self.assertEqual(prop.raw_data["instances"][0]["price"], 250000.0)


if __name__ == "__main__":
    unittest.main()
