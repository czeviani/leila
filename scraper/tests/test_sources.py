import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from sources.base import ScrapedProperty
from sources.caixa import _apply_detail_stages, _parse_detail_stages
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


class CaixaStageTests(unittest.TestCase):
    DETAIL_HTML = """
      <div>Valor de avaliação: R$ 925.000,00</div>
      <div>Valor mínimo de venda 1º Leilão: R$ 925.000,00</div>
      <div>Valor mínimo de venda 2º Leilão: R$ 637.191,56</div>
      <div>Data do 1º Leilão - 08/09/2026 - 10h00</div>
      <div>Data do 2º Leilão - 14/09/2026 - 10h00</div>
    """

    @staticmethod
    def _property():
        return ScrapedProperty(
            source_id="caixa",
            external_id="SP-1444412267740",
            title="Apartamento — São Paulo/SP",
            auction_price=925000,
            appraised_value=925000,
            raw_data={},
        )

    def test_first_stage_is_selected_before_first_auction(self):
        stages = _parse_detail_stages(self.DETAIL_HTML)
        prop = self._property()
        applied = _apply_detail_stages(
            prop,
            stages,
            datetime(2026, 8, 19, 10, 0, tzinfo=ZoneInfo("America/Sao_Paulo")),
        )
        self.assertTrue(applied)
        self.assertEqual(prop.auction_stage, "first")
        self.assertEqual(prop.current_stage_price, 925000)
        self.assertEqual(prop.auction_price, 637191.56)
        self.assertEqual(prop.target_stage, "second")
        self.assertEqual(prop.auction_date.isoformat(), "2026-09-08")
        self.assertEqual(prop.auction_modality, "primeira_praca")
        self.assertEqual([stage["status"] for stage in prop.auction_stages], ["current", "upcoming", "possible"])

    def test_second_stage_is_selected_after_first_auction(self):
        stages = _parse_detail_stages(self.DETAIL_HTML)
        prop = self._property()
        _apply_detail_stages(
            prop,
            stages,
            datetime(2026, 9, 8, 11, 0, tzinfo=ZoneInfo("America/Sao_Paulo")),
        )
        self.assertEqual(prop.auction_stage, "second")
        self.assertEqual(prop.current_stage_price, 637191.56)
        self.assertEqual(prop.auction_price, 637191.56)
        self.assertEqual(prop.auction_date.isoformat(), "2026-09-14")
        self.assertEqual(prop.auction_modality, "segunda_praca")
        self.assertAlmostEqual(prop.discount_pct, 31.11, places=2)


if __name__ == "__main__":
    unittest.main()
